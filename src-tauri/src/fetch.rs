use std::collections::BTreeMap;

use futures_util::StreamExt;
use parking_lot::Mutex;
use reqwest::header::{HeaderMap, HeaderName, HeaderValue};
use serde::{Deserialize, Serialize};
use tauri::ipc::{Channel, InvokeResponseBody, IpcResponse};
use tokio::sync::oneshot;

use crate::config::{get_config, reqwest_proxy, ProxyConfig};

pub const ABORTED_ERROR: &str = "AbortError";

#[derive(Debug, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct FetchRequest {
    id: String,
    method: String,
    url: String,
    headers: Vec<(String, String)>,
    body: Option<String>,
    /// Overrides the stored proxy settings, for example to test a proxy before saving it.
    proxy: Option<ProxyConfig>,
}

#[derive(Debug, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct FetchResponse {
    status: u16,
    status_text: String,
    headers: Vec<(String, String)>,
}

/// A message on the response body channel. Chunks are sent as raw bytes (an `ArrayBuffer` in
/// JavaScript); the end of the body is `{ "done": true }` and a failure is `{ "error": "..." }`.
#[derive(Debug, PartialEq)]
pub enum FetchBodyMessage {
    Chunk(Vec<u8>),
    Done,
    Error(String),
}

impl IpcResponse for FetchBodyMessage {
    fn body(self) -> tauri::Result<InvokeResponseBody> {
        Ok(match self {
            Self::Chunk(bytes) => InvokeResponseBody::Raw(bytes),
            Self::Done => InvokeResponseBody::Json(serde_json::json!({ "done": true }).to_string()),
            Self::Error(message) => {
                InvokeResponseBody::Json(serde_json::json!({ "error": message }).to_string())
            }
        })
    }
}

impl specta::Type for FetchBodyMessage {
    fn definition(types: &mut specta::Types) -> specta::datatype::DataType {
        specta_typescript::Unknown::<()>::definition(types)
    }
}

enum Cancellation {
    Pending(oneshot::Sender<()>),
    // `fetch_cancel` ran before `fetch` registered the request.
    Requested,
}

static CANCELLATIONS: Mutex<BTreeMap<String, Cancellation>> = Mutex::new(BTreeMap::new());

/// Registers a request for cancellation, or returns `None` when it was already cancelled.
fn register(id: &str) -> Option<oneshot::Receiver<()>> {
    let mut cancellations = CANCELLATIONS.lock();
    if let Some(Cancellation::Requested) = cancellations.remove(id) {
        return None;
    }
    let (sender, receiver) = oneshot::channel();
    cancellations.insert(id.to_string(), Cancellation::Pending(sender));
    Some(receiver)
}

fn unregister(id: &str) {
    CANCELLATIONS.lock().remove(id);
}

/// Sends a request and streams its body through `on_body`. The command returns once the response
/// headers arrive; `fetch_cancel` stops the request at any point and closes the connection.
#[tauri::command]
#[specta::specta]
pub async fn fetch(
    request: FetchRequest,
    on_body: Channel<FetchBodyMessage>,
) -> Result<FetchResponse, String> {
    let id = request.id.clone();
    let mut cancelled = register(&id).ok_or(ABORTED_ERROR)?;
    let response = tokio::select! {
        response = send(request) => response,
        _ = &mut cancelled => Err(ABORTED_ERROR.to_string()),
    };
    let response = match response {
        Ok(response) => response,
        Err(error) => {
            unregister(&id);
            return Err(error);
        }
    };
    let head = FetchResponse {
        status: response.status().as_u16(),
        status_text: response
            .status()
            .canonical_reason()
            .unwrap_or_default()
            .to_string(),
        headers: response
            .headers()
            .iter()
            .filter_map(|(name, value)| Some((name.to_string(), value.to_str().ok()?.to_string())))
            .collect(),
    };
    tauri::async_runtime::spawn(async move {
        let mut body = response.bytes_stream();
        loop {
            let message = tokio::select! {
                chunk = body.next() => match chunk {
                    Some(Ok(bytes)) => FetchBodyMessage::Chunk(bytes.to_vec()),
                    Some(Err(error)) => FetchBodyMessage::Error(error.to_string()),
                    None => FetchBodyMessage::Done,
                },
                // Dropping the body closes the connection.
                _ = &mut cancelled => break,
            };
            let last = !matches!(message, FetchBodyMessage::Chunk(_));
            if on_body.send(message).is_err() || last {
                break;
            }
        }
        unregister(&id);
    });
    Ok(head)
}

#[tauri::command]
#[specta::specta]
pub fn fetch_cancel(id: String) {
    let mut cancellations = CANCELLATIONS.lock();
    match cancellations.remove(&id) {
        Some(Cancellation::Pending(sender)) => {
            let _ = sender.send(());
        }
        _ => {
            cancellations.insert(id, Cancellation::Requested);
        }
    }
}

async fn send(request: FetchRequest) -> Result<reqwest::Response, String> {
    let mut headers = HeaderMap::new();
    for (name, value) in request.headers {
        headers.append(
            HeaderName::try_from(name).map_err(|error| error.to_string())?,
            HeaderValue::try_from(value).map_err(|error| error.to_string())?,
        );
    }
    let proxy_config = match request.proxy {
        Some(proxy) => Some(proxy),
        None => get_config().ok().and_then(|config| config.proxy),
    };
    let mut client = reqwest::Client::builder();
    if let Some(proxy) = proxy_config
        .as_ref()
        .map(reqwest_proxy)
        .transpose()?
        .flatten()
    {
        client = client.proxy(proxy);
    }
    let client = client.build().map_err(|error| error.to_string())?;
    let method = request
        .method
        .parse::<reqwest::Method>()
        .map_err(|error| error.to_string())?;
    let mut builder = client.request(method, &request.url).headers(headers);
    if let Some(body) = request.body {
        builder = builder.body(body);
    }
    builder.send().await.map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};
    use std::net::{TcpListener, TcpStream};
    use std::sync::mpsc;
    use std::time::Duration;

    fn request(id: &str, url: String) -> FetchRequest {
        FetchRequest {
            id: id.to_string(),
            method: "POST".to_string(),
            url,
            headers: vec![("content-type".to_string(), "application/json".to_string())],
            body: Some("{}".to_string()),
            proxy: Some(ProxyConfig {
                enabled: Some(false),
                protocol: None,
                server: None,
                port: None,
                basic_auth: None,
                no_proxy: None,
            }),
        }
    }

    fn collecting_channel() -> (
        Channel<FetchBodyMessage>,
        mpsc::Receiver<InvokeResponseBody>,
    ) {
        let (sender, receiver) = mpsc::channel();
        let sender = parking_lot::Mutex::new(sender);
        let channel = Channel::new(move |body| {
            let _ = sender.lock().send(body);
            Ok(())
        });
        (channel, receiver)
    }

    /// Serves one request with `response`, then reports when the client closes the connection.
    fn serve_once(response: &'static [u8]) -> (String, mpsc::Receiver<()>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let url = format!("http://{}/stream", listener.local_addr().unwrap());
        let (closed_sender, closed) = mpsc::channel();
        std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            read_request(&mut stream);
            stream.write_all(response).unwrap();
            stream.flush().unwrap();
            let mut buffer = [0; 64];
            // The server sends nothing more; a read of 0 bytes or an error means the client
            // closed the connection.
            while matches!(stream.read(&mut buffer), Ok(n) if n > 0) {}
            let _ = closed_sender.send(());
        });
        (url, closed)
    }

    fn read_request(stream: &mut TcpStream) {
        let mut request = Vec::new();
        let mut buffer = [0; 1024];
        while !request.windows(4).any(|window| window == b"\r\n\r\n") {
            let n = stream.read(&mut buffer).unwrap();
            request.extend_from_slice(&buffer[..n]);
        }
        let head = String::from_utf8_lossy(&request).to_lowercase();
        let length: usize = head
            .lines()
            .find_map(|line| line.strip_prefix("content-length:"))
            .map(|value| value.trim().parse().unwrap())
            .unwrap_or(0);
        let body_start = request.windows(4).position(|w| w == b"\r\n\r\n").unwrap() + 4;
        let mut received = request.len() - body_start;
        while received < length {
            received += stream.read(&mut buffer).unwrap();
        }
    }

    fn raw(body: InvokeResponseBody) -> Vec<u8> {
        match body {
            InvokeResponseBody::Raw(bytes) => bytes,
            InvokeResponseBody::Json(json) => panic!("expected raw bytes, got {json}"),
        }
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn cancelling_a_paused_body_closes_the_connection() {
        let (url, closed) = serve_once(
            b"HTTP/1.1 200 OK\r\ncontent-type: text/event-stream\r\ntransfer-encoding: chunked\r\n\r\n6\r\ndata:1\r\n",
        );
        let (channel, messages) = collecting_channel();

        let head = fetch(request("paused", url), channel).await.unwrap();
        assert_eq!(head.status, 200);
        let first = messages.recv_timeout(Duration::from_secs(5)).unwrap();
        assert_eq!(raw(first), b"data:1");

        fetch_cancel("paused".to_string());
        closed
            .recv_timeout(Duration::from_secs(2))
            .expect("the connection stays open after cancelling");
        assert!(messages.recv_timeout(Duration::from_millis(200)).is_err());
        assert!(CANCELLATIONS.lock().get("paused").is_none());
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn cancelling_while_waiting_for_the_response_head_closes_the_connection() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let url = format!("http://{}/", listener.local_addr().unwrap());
        let (received_sender, received) = mpsc::channel();
        let (closed_sender, closed) = mpsc::channel();
        std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            read_request(&mut stream);
            let _ = received_sender.send(());
            // Never answer, like a server that is still thinking.
            let mut buffer = [0; 64];
            while matches!(stream.read(&mut buffer), Ok(n) if n > 0) {}
            let _ = closed_sender.send(());
        });
        let (channel, _messages) = collecting_channel();

        let request = tokio::spawn(fetch(request("head", url), channel));
        tokio::task::spawn_blocking(move || received.recv_timeout(Duration::from_secs(5)))
            .await
            .unwrap()
            .expect("the request never reached the server");
        fetch_cancel("head".to_string());

        let error = tokio::time::timeout(Duration::from_secs(2), request)
            .await
            .expect("the command keeps waiting after cancelling")
            .unwrap()
            .unwrap_err();
        assert_eq!(error, ABORTED_ERROR);
        closed
            .recv_timeout(Duration::from_secs(2))
            .expect("the connection stays open after cancelling");
        assert!(CANCELLATIONS.lock().get("head").is_none());
    }
}
