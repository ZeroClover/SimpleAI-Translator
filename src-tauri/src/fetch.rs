use debug_print::debug_println;
use futures_util::stream::{AbortHandle, Abortable};
use futures_util::StreamExt;
use std::collections::HashMap;

use reqwest::{
    header::{HeaderMap, HeaderName},
    Client,
};
use serde::{Deserialize, Serialize};
use tauri::{Emitter, Listener};

use crate::config::{get_config, ProxyProtocol};
use crate::APP_HANDLE;

#[derive(Debug, Serialize, Deserialize, Clone)]
struct FetchOptions {
    method: String,
    headers: HashMap<String, String>,
    body: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub(crate) struct StreamChunk {
    id: String,
    data: String,
    done: bool,
    status: u16,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct StreamStatusCode {
    id: String,
    status: u16,
    content_type: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub(crate) struct AbortEventPayload {
    id: String,
}

const INVALID_UTF8_ERROR: &str = "failed to decode response body: invalid UTF-8";

/// Decodes a byte stream as UTF-8, keeping a character split across chunks until its
/// remaining bytes arrive.
#[derive(Default)]
struct Utf8StreamDecoder {
    pending: Vec<u8>,
}

impl Utf8StreamDecoder {
    fn push(&mut self, chunk: &[u8]) -> Result<String, String> {
        self.pending.extend_from_slice(chunk);
        let valid_len = match std::str::from_utf8(&self.pending) {
            Ok(_) => self.pending.len(),
            // An incomplete sequence at the end may still be completed by the next chunk.
            Err(err) if err.error_len().is_none() => err.valid_up_to(),
            Err(_) => return Err(INVALID_UTF8_ERROR.to_string()),
        };
        let rest = self.pending.split_off(valid_len);
        let text = String::from_utf8(std::mem::replace(&mut self.pending, rest))
            .map_err(|_| INVALID_UTF8_ERROR.to_string())?;
        Ok(text)
    }

    fn finish(&self) -> Result<(), String> {
        if self.pending.is_empty() {
            Ok(())
        } else {
            Err(INVALID_UTF8_ERROR.to_string())
        }
    }
}

#[tauri::command]
#[specta::specta]
pub async fn fetch_stream(id: String, url: String, options_str: String) -> Result<String, String> {
    let options: FetchOptions = serde_json::from_str(&options_str).unwrap();
    let mut headers = HeaderMap::new();
    for (key, value) in options.headers {
        headers.insert(key.parse::<HeaderName>().unwrap(), value.parse().unwrap());
    }

    let mut client_builder = Client::builder().default_headers(headers);

    if let Ok(config) = get_config() {
        if let Some(proxy_config) = config.proxy {
            if proxy_config.enabled.unwrap_or(false)
                && proxy_config.protocol.is_some()
                && proxy_config.server.is_some()
                && proxy_config.port.is_some()
            {
                let proxy_url = format!(
                    "{}:{}",
                    proxy_config.server.unwrap_or_default(),
                    proxy_config.port.unwrap_or_default()
                );
                let proxy_url = match proxy_config.protocol {
                    Some(ProxyProtocol::HTTP) => format!("http://{}", proxy_url),
                    Some(ProxyProtocol::HTTPS) => format!("https://{}", proxy_url),
                    None => proxy_url,
                };
                let mut proxy = reqwest::Proxy::all(&proxy_url).unwrap();
                if let Some(basic_auth) = proxy_config.basic_auth {
                    let username = basic_auth.username.unwrap_or_default();
                    if !username.is_empty() {
                        proxy =
                            proxy.basic_auth(&username, &basic_auth.password.unwrap_or_default());
                    }
                }
                if let Some(no_proxy) = proxy_config.no_proxy {
                    proxy = proxy.no_proxy(Some(reqwest::NoProxy::from_string(&no_proxy).unwrap()));
                }
                client_builder = client_builder.proxy(proxy);
            }
        }
    }

    let client = client_builder
        .build()
        .map_err(|err| format!("failed to generate client: {}", err))?;

    let request_builder = client.request(
        options
            .method
            .parse()
            .map_err(|err| format!("failed to parse method: {}", err))?,
        url.parse::<reqwest::Url>()
            .map_err(|err| format!("failed to parse url: {}", err))?,
    );

    let resp = request_builder
        .body(options.body)
        .send()
        .await
        .map_err(|err| format!("failed to call API: {}", err))?;

    let status = resp.status();
    let content_type = resp
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .map(str::to_string);

    let app_handle = APP_HANDLE.get().unwrap();
    app_handle
        .emit(
            "fetch-stream-status-code",
            StreamStatusCode {
                id: id.clone(),
                status: status.as_u16(),
                content_type,
            },
        )
        .unwrap();

    let stream = resp.bytes_stream();

    let (abort_handle, abort_registration) = AbortHandle::new_pair();
    let cloned_id = id.clone();
    let listen_id = app_handle.listen_any("abort-fetch-stream", move |msg| {
        let payload: AbortEventPayload = serde_json::from_str(msg.payload()).unwrap();
        if payload.id == cloned_id {
            debug_println!("aborting fetch stream: {}", payload.id);
            abort_handle.abort();
        } else {
            debug_println!("ignoring abort event for: {}", payload.id);
        }
    });

    let mut stream = Abortable::new(stream, abort_registration);
    let mut decoder = Utf8StreamDecoder::default();

    let result = async {
        while let Some(item) = stream.next().await {
            let chunk = item.map_err(|err| format!("failed to read response chunk: {}", err))?;
            let data = decoder.push(&chunk)?;
            if data.is_empty() {
                continue;
            }
            app_handle
                .emit(
                    "fetch-stream-chunk",
                    StreamChunk {
                        id: id.clone(),
                        data,
                        done: false,
                        status: status.as_u16(),
                    },
                )
                .unwrap();
        }
        decoder.finish()
    }
    .await;
    app_handle.unlisten(listen_id);
    result?;

    debug_println!("chunk done!");
    app_handle
        .emit(
            "fetch-stream-chunk",
            StreamChunk {
                id: id.clone(),
                data: "".to_string(),
                done: true,
                status: status.as_u16(),
            },
        )
        .unwrap();

    Ok("".to_string())
}

#[cfg(test)]
mod tests {
    use super::Utf8StreamDecoder;

    #[test]
    fn joins_characters_split_across_chunks() {
        let text = "你好😀";
        let bytes = text.as_bytes();
        for split in 0..=bytes.len() {
            let mut decoder = Utf8StreamDecoder::default();
            let mut decoded = decoder.push(&bytes[..split]).unwrap();
            decoded.push_str(&decoder.push(&bytes[split..]).unwrap());
            decoder.finish().unwrap();
            assert_eq!(decoded, text);
        }
    }

    #[test]
    fn decodes_one_byte_at_a_time() {
        let text = "{\"translatedText\":\"中文😀\"}";
        let mut decoder = Utf8StreamDecoder::default();
        let decoded: String = text
            .as_bytes()
            .iter()
            .map(|byte| decoder.push(&[*byte]).unwrap())
            .collect();
        decoder.finish().unwrap();
        assert_eq!(decoded, text);
    }

    #[test]
    fn rejects_invalid_bytes() {
        let mut decoder = Utf8StreamDecoder::default();
        assert!(decoder.push(&[b'a', 0xff, b'b']).is_err());
    }

    #[test]
    fn rejects_a_truncated_character_at_the_end() {
        let mut decoder = Utf8StreamDecoder::default();
        assert_eq!(decoder.push(&"你".as_bytes()[..2]).unwrap(), "");
        assert!(decoder.finish().is_err());
    }
}
