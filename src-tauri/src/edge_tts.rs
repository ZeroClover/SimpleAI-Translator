use base64::{engine::general_purpose, Engine};
use futures_util::{SinkExt, StreamExt};
use rand::RngCore;
use reqwest::{
    header::{HeaderMap, HeaderName, HeaderValue},
    Client, ClientBuilder, Response, StatusCode,
};
use reqwest_websocket::{Message, RequestBuilderExt};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fmt;
use std::sync::atomic::{AtomicI64, Ordering};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use time::{Month, OffsetDateTime, Weekday};
use url::Url;
use uuid::Uuid;

use crate::config::{get_config, Config, ProxyProtocol};

pub(crate) const BASE_URL: &str = "speech.platform.bing.com/consumer/speech/synthesize/readaloud";
pub(crate) const WSS_URL: &str =
    "wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1";
pub(crate) const VOICE_LIST_URL: &str =
    "https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/voices/list";
pub(crate) const TRUSTED_CLIENT_TOKEN: &str = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
pub(crate) const CHROMIUM_FULL_VERSION: &str = "143.0.3650.75";
pub(crate) const CHROMIUM_MAJOR_VERSION: &str = "143";
pub(crate) const SEC_MS_GEC_VERSION: &str = "1-143.0.3650.75";
pub(crate) const OUTPUT_FORMAT: &str = "audio-24khz-48kbitrate-mono-mp3";
pub(crate) const EDGE_ORIGIN: &str = "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold";

const WINDOWS_EPOCH_SECONDS: i64 = 11_644_473_600;
const SEC_MS_GEC_ROUNDING_SECONDS: i64 = 300;
const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);
const RECEIVE_TIMEOUT: Duration = Duration::from_secs(60);
const MAX_SSML_TEXT_BYTES: usize = 4096;
const MIME_TYPE: &str = "audio/mpeg";

static CLOCK_SKEW_MILLIS: AtomicI64 = AtomicI64::new(0);

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct EdgeTtsVoice {
    pub short_name: String,
    pub friendly_name: String,
    pub locale: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct EdgeTtsSynthesizeRequest {
    pub text: String,
    pub voice: String,
    pub rate: String,
    pub volume: String,
    pub pitch: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct EdgeTtsSynthesizeResult {
    pub mime_type: String,
    pub audio_segments: Vec<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum EdgeTtsErrorKind {
    Network,
    Auth,
    Protocol,
    Timeout,
    NoAudio,
}

impl EdgeTtsErrorKind {
    fn as_str(self) -> &'static str {
        match self {
            Self::Network => "network",
            Self::Auth => "auth",
            Self::Protocol => "protocol",
            Self::Timeout => "timeout",
            Self::NoAudio => "no-audio",
        }
    }
}

impl fmt::Display for EdgeTtsErrorKind {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(self.as_str())
    }
}

#[derive(Debug, thiserror::Error)]
#[error("{kind}: {message}")]
pub(crate) struct EdgeTtsError {
    kind: EdgeTtsErrorKind,
    message: String,
    status: Option<StatusCode>,
    server_date: Option<String>,
}

impl EdgeTtsError {
    pub(crate) fn new(kind: EdgeTtsErrorKind, message: impl Into<String>) -> Self {
        Self {
            kind,
            message: message.into(),
            status: None,
            server_date: None,
        }
    }

    pub(crate) fn network(message: impl Into<String>) -> Self {
        Self::new(EdgeTtsErrorKind::Network, message)
    }

    pub(crate) fn auth(message: impl Into<String>) -> Self {
        Self::new(EdgeTtsErrorKind::Auth, message)
    }

    pub(crate) fn protocol(message: impl Into<String>) -> Self {
        Self::new(EdgeTtsErrorKind::Protocol, message)
    }

    pub(crate) fn timeout(message: impl Into<String>) -> Self {
        Self::new(EdgeTtsErrorKind::Timeout, message)
    }

    pub(crate) fn no_audio(message: impl Into<String>) -> Self {
        Self::new(EdgeTtsErrorKind::NoAudio, message)
    }

    fn forbidden(message: impl Into<String>, response: &Response) -> Self {
        let server_date = response
            .headers()
            .get(reqwest::header::DATE)
            .and_then(|value| value.to_str().ok())
            .map(ToOwned::to_owned);

        Self {
            kind: EdgeTtsErrorKind::Auth,
            message: message.into(),
            status: Some(StatusCode::FORBIDDEN),
            server_date,
        }
    }

    fn can_retry_with_clock_skew(&self) -> bool {
        self.kind == EdgeTtsErrorKind::Auth && self.status == Some(StatusCode::FORBIDDEN)
    }

    pub(crate) fn into_command_error(self) -> String {
        format!("{}: {}", self.kind.as_str(), self.message)
    }
}

impl From<reqwest::Error> for EdgeTtsError {
    fn from(error: reqwest::Error) -> Self {
        if error.is_timeout() {
            return Self::timeout(format!("request timed out: {error}"));
        }

        Self::network(format!("request failed: {error}"))
    }
}

impl From<reqwest_websocket::Error> for EdgeTtsError {
    fn from(error: reqwest_websocket::Error) -> Self {
        match error {
            reqwest_websocket::Error::Reqwest(error) => error.into(),
            reqwest_websocket::Error::Handshake(handshake_error) => {
                EdgeTtsError::protocol(format!("websocket handshake failed: {handshake_error}"))
            }
            reqwest_websocket::Error::Tungstenite(error) => {
                EdgeTtsError::protocol(format!("websocket protocol failed: {error}"))
            }
            _ => EdgeTtsError::protocol(format!("websocket failed: {error}")),
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
struct UpstreamVoice {
    short_name: String,
    friendly_name: Option<String>,
    locale: String,
}

#[derive(Debug, PartialEq, Eq)]
enum TextFrame {
    AudioMetadata,
    Response,
    TurnStart,
    TurnEnd,
}

#[tauri::command]
#[specta::specta]
pub async fn edge_tts_list_voices() -> Result<Vec<EdgeTtsVoice>, String> {
    list_voices()
        .await
        .map_err(EdgeTtsError::into_command_error)
}

#[tauri::command]
#[specta::specta]
pub async fn edge_tts_synthesize(
    request: EdgeTtsSynthesizeRequest,
) -> Result<EdgeTtsSynthesizeResult, String> {
    synthesize(request)
        .await
        .map_err(EdgeTtsError::into_command_error)
}

async fn list_voices() -> Result<Vec<EdgeTtsVoice>, EdgeTtsError> {
    let client = edge_client()?;

    match fetch_voice_list_once(&client).await {
        Err(error) if error.can_retry_with_clock_skew() => {
            apply_clock_skew_retry(&error)?;
            fetch_voice_list_once(&client).await
        }
        result => result,
    }
}

async fn synthesize(
    request: EdgeTtsSynthesizeRequest,
) -> Result<EdgeTtsSynthesizeResult, EdgeTtsError> {
    let client = edge_client()?;
    let text_segments = prepare_text_segments(&request.text)?;

    if text_segments.is_empty() {
        return Err(EdgeTtsError::no_audio("no speakable text"));
    }

    let mut audio_segments = Vec::with_capacity(text_segments.len());
    for text_segment in text_segments {
        let audio = synthesize_segment_with_retry(&client, &request, &text_segment).await?;
        audio_segments.push(general_purpose::STANDARD.encode(audio));
    }

    Ok(EdgeTtsSynthesizeResult {
        mime_type: MIME_TYPE.to_string(),
        audio_segments,
    })
}

fn edge_client() -> Result<Client, EdgeTtsError> {
    let config = get_config().ok();
    build_edge_client(config.as_ref())
}

fn build_edge_client(config: Option<&Config>) -> Result<Client, EdgeTtsError> {
    let builder = Client::builder()
        .http1_only()
        .connect_timeout(CONNECT_TIMEOUT);

    apply_proxy_config(builder, config)?
        .build()
        .map_err(|error| EdgeTtsError::network(format!("failed to build HTTP client: {error}")))
}

fn apply_proxy_config(
    mut builder: ClientBuilder,
    config: Option<&Config>,
) -> Result<ClientBuilder, EdgeTtsError> {
    let Some(proxy_config) = config.and_then(|config| config.proxy.as_ref()) else {
        return Ok(builder);
    };

    if !proxy_config.enabled.unwrap_or(false) {
        return Ok(builder);
    }

    let (Some(protocol), Some(server), Some(port)) = (
        proxy_config.protocol.as_ref(),
        proxy_config.server.as_ref(),
        proxy_config.port.as_ref(),
    ) else {
        return Ok(builder);
    };

    let proxy_url = match protocol {
        ProxyProtocol::HTTP => format!("http://{server}:{port}"),
        ProxyProtocol::HTTPS => format!("https://{server}:{port}"),
    };
    let mut proxy = reqwest::Proxy::all(&proxy_url)
        .map_err(|error| EdgeTtsError::network(format!("invalid proxy URL: {error}")))?;

    if let Some(basic_auth) = proxy_config.basic_auth.as_ref() {
        let username = basic_auth.username.as_deref().unwrap_or_default();
        if !username.is_empty() {
            proxy = proxy.basic_auth(username, basic_auth.password.as_deref().unwrap_or_default());
        }
    }

    if let Some(no_proxy) = proxy_config.no_proxy.as_deref() {
        let no_proxy = reqwest::NoProxy::from_string(no_proxy)
            .ok_or_else(|| EdgeTtsError::network("invalid no_proxy value"))?;
        proxy = proxy.no_proxy(Some(no_proxy));
    }

    builder = builder.proxy(proxy);
    Ok(builder)
}

async fn fetch_voice_list_once(client: &Client) -> Result<Vec<EdgeTtsVoice>, EdgeTtsError> {
    let response = client
        .get(edge_voice_list_url()?)
        .headers(voice_headers())
        .send()
        .await?;

    if response.status() == StatusCode::FORBIDDEN {
        return Err(EdgeTtsError::forbidden(
            "Edge TTS voice list returned 403",
            &response,
        ));
    }

    if !response.status().is_success() {
        return Err(EdgeTtsError::network(format!(
            "Edge TTS voice list returned HTTP {}",
            response.status()
        )));
    }

    let upstream_voices: Vec<UpstreamVoice> = response.json().await.map_err(|error| {
        EdgeTtsError::protocol(format!("failed to parse Edge TTS voice list: {error}"))
    })?;

    Ok(upstream_voices
        .into_iter()
        .map(|voice| {
            let friendly_name = voice
                .friendly_name
                .unwrap_or_else(|| voice.short_name.clone());
            EdgeTtsVoice {
                short_name: voice.short_name,
                friendly_name,
                locale: voice.locale,
            }
        })
        .collect())
}

async fn synthesize_segment_with_retry(
    client: &Client,
    request: &EdgeTtsSynthesizeRequest,
    escaped_text: &str,
) -> Result<Vec<u8>, EdgeTtsError> {
    match synthesize_segment_once(client, request, escaped_text).await {
        Err(error) if error.can_retry_with_clock_skew() => {
            apply_clock_skew_retry(&error)?;
            synthesize_segment_once(client, request, escaped_text).await
        }
        result => result,
    }
}

async fn synthesize_segment_once(
    client: &Client,
    request: &EdgeTtsSynthesizeRequest,
    escaped_text: &str,
) -> Result<Vec<u8>, EdgeTtsError> {
    let upgrade_response = tokio::time::timeout(
        CONNECT_TIMEOUT,
        client
            .get(edge_wss_url()?)
            .headers(wss_headers())
            .upgrade()
            .send(),
    )
    .await
    .map_err(|_| EdgeTtsError::timeout("Edge TTS WebSocket connect timed out"))??;

    if upgrade_response.status() == StatusCode::FORBIDDEN {
        return Err(EdgeTtsError::forbidden(
            "Edge TTS synthesis returned 403",
            &upgrade_response,
        ));
    }

    if upgrade_response.status() != StatusCode::SWITCHING_PROTOCOLS {
        return Err(EdgeTtsError::network(format!(
            "Edge TTS WebSocket returned HTTP {}",
            upgrade_response.status()
        )));
    }

    let mut websocket = tokio::time::timeout(CONNECT_TIMEOUT, upgrade_response.into_websocket())
        .await
        .map_err(|_| EdgeTtsError::timeout("Edge TTS WebSocket handshake timed out"))??;

    websocket
        .send(Message::Text(speech_config_message()))
        .await
        .map_err(EdgeTtsError::from)?;

    websocket
        .send(Message::Text(ssml_message(request, escaped_text)))
        .await
        .map_err(EdgeTtsError::from)?;

    let mut audio = Vec::new();

    loop {
        let message = tokio::time::timeout(RECEIVE_TIMEOUT, websocket.next())
            .await
            .map_err(|_| EdgeTtsError::timeout("Edge TTS audio receive timed out"))?;

        let Some(message) = message else {
            return Err(EdgeTtsError::protocol(
                "Edge TTS WebSocket closed before turn.end",
            ));
        };

        match message.map_err(EdgeTtsError::from)? {
            Message::Text(text) => match parse_text_frame(&text)? {
                TextFrame::AudioMetadata | TextFrame::Response | TextFrame::TurnStart => {}
                TextFrame::TurnEnd => {
                    if audio.is_empty() {
                        return Err(EdgeTtsError::no_audio("Edge TTS completed without audio"));
                    }
                    return Ok(audio);
                }
            },
            Message::Binary(data) => {
                if let Some(chunk) = parse_binary_audio_frame(data.as_ref())? {
                    audio.extend_from_slice(&chunk);
                }
            }
            Message::Close { .. } => {
                return Err(EdgeTtsError::protocol(
                    "Edge TTS WebSocket closed before turn.end",
                ));
            }
            Message::Ping(_) | Message::Pong(_) => {}
        }
    }
}

fn edge_voice_list_url() -> Result<Url, EdgeTtsError> {
    let expected_voice_list_url = format!("https://{BASE_URL}/voices/list");
    debug_assert_eq!(VOICE_LIST_URL, expected_voice_list_url);

    let mut url = Url::parse(VOICE_LIST_URL)
        .map_err(|error| EdgeTtsError::protocol(format!("invalid voice-list URL: {error}")))?;
    url.query_pairs_mut()
        .append_pair("trustedclienttoken", TRUSTED_CLIENT_TOKEN);
    append_sec_ms_gec_query(&mut url);
    Ok(url)
}

fn edge_wss_url() -> Result<Url, EdgeTtsError> {
    let expected_wss_url = format!("wss://{BASE_URL}/edge/v1");
    debug_assert_eq!(WSS_URL, expected_wss_url);

    let mut url = Url::parse(WSS_URL)
        .map_err(|error| EdgeTtsError::protocol(format!("invalid WSS URL: {error}")))?;
    url.query_pairs_mut()
        .append_pair("TrustedClientToken", TRUSTED_CLIENT_TOKEN)
        .append_pair("ConnectionId", &new_connection_id());
    append_sec_ms_gec_query(&mut url);
    Ok(url)
}

fn append_sec_ms_gec_query(url: &mut Url) {
    let expected_sec_ms_gec_version = format!("1-{CHROMIUM_FULL_VERSION}");
    debug_assert_eq!(SEC_MS_GEC_VERSION, expected_sec_ms_gec_version);

    url.query_pairs_mut()
        .append_pair("Sec-MS-GEC", &generate_sec_ms_gec())
        .append_pair("Sec-MS-GEC-Version", SEC_MS_GEC_VERSION);
}

fn voice_headers() -> HeaderMap {
    let mut headers = HeaderMap::new();
    insert_static_header(&mut headers, "authority", "speech.platform.bing.com");
    insert_header(
        &mut headers,
        "sec-ch-ua",
        &format!(
            "\" Not;A Brand\";v=\"99\", \"Microsoft Edge\";v=\"{CHROMIUM_MAJOR_VERSION}\", \"Chromium\";v=\"{CHROMIUM_MAJOR_VERSION}\""
        ),
    );
    insert_static_header(&mut headers, "sec-ch-ua-mobile", "?0");
    insert_static_header(&mut headers, "accept", "*/*");
    insert_static_header(&mut headers, "sec-fetch-site", "none");
    insert_static_header(&mut headers, "sec-fetch-mode", "cors");
    insert_static_header(&mut headers, "sec-fetch-dest", "empty");
    insert_base_headers(&mut headers);
    insert_header(
        &mut headers,
        "cookie",
        &format!("muid={};", generate_muid()),
    );
    headers
}

fn wss_headers() -> HeaderMap {
    let mut headers = HeaderMap::new();
    insert_static_header(&mut headers, "pragma", "no-cache");
    insert_static_header(&mut headers, "cache-control", "no-cache");
    insert_static_header(&mut headers, "origin", EDGE_ORIGIN);
    insert_static_header(&mut headers, "sec-websocket-version", "13");
    insert_base_headers(&mut headers);
    insert_header(
        &mut headers,
        "cookie",
        &format!("muid={};", generate_muid()),
    );
    headers
}

fn insert_base_headers(headers: &mut HeaderMap) {
    insert_header(headers, "user-agent", &edge_user_agent());
    insert_static_header(headers, "accept-encoding", "gzip, deflate, br, zstd");
    insert_static_header(headers, "accept-language", "en-US,en;q=0.9");
}

fn edge_user_agent() -> String {
    format!(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/{CHROMIUM_MAJOR_VERSION}.0.0.0 Safari/537.36 Edg/{CHROMIUM_MAJOR_VERSION}.0.0.0"
    )
}

fn insert_static_header(headers: &mut HeaderMap, name: &'static str, value: &'static str) {
    headers.insert(
        HeaderName::from_static(name),
        HeaderValue::from_static(value),
    );
}

fn insert_header(headers: &mut HeaderMap, name: &'static str, value: &str) {
    headers.insert(
        HeaderName::from_static(name),
        HeaderValue::from_str(value).expect("controlled Edge TTS header should be valid"),
    );
}

fn generate_sec_ms_gec() -> String {
    generate_sec_ms_gec_for_unix_millis(current_unix_millis_with_skew())
}

fn generate_sec_ms_gec_for_unix_millis(unix_millis: i64) -> String {
    let unix_seconds = unix_millis.div_euclid(1000);
    let mut seconds = unix_seconds + WINDOWS_EPOCH_SECONDS;
    seconds -= seconds.rem_euclid(SEC_MS_GEC_ROUNDING_SECONDS);
    let ticks = seconds * 10_000_000;
    let mut hasher = Sha256::new();
    hasher.update(format!("{ticks}{TRUSTED_CLIENT_TOKEN}").as_bytes());
    format!("{:X}", hasher.finalize())
}

fn generate_muid() -> String {
    let mut bytes = [0_u8; 16];
    rand::thread_rng().fill_bytes(&mut bytes);
    bytes.iter().map(|byte| format!("{byte:02X}")).collect()
}

fn new_connection_id() -> String {
    Uuid::new_v4().simple().to_string()
}

fn current_unix_millis_with_skew() -> i64 {
    unix_millis(SystemTime::now()).unwrap_or(0) + CLOCK_SKEW_MILLIS.load(Ordering::Acquire)
}

fn unix_millis(time: SystemTime) -> Result<i64, EdgeTtsError> {
    let duration = time
        .duration_since(UNIX_EPOCH)
        .map_err(|error| EdgeTtsError::protocol(format!("invalid system time: {error}")))?;
    Ok(duration.as_millis() as i64)
}

fn apply_clock_skew_retry(error: &EdgeTtsError) -> Result<(), EdgeTtsError> {
    let server_date = error
        .server_date
        .as_deref()
        .ok_or_else(|| EdgeTtsError::auth("Edge TTS 403 response did not include a Date header"))?;
    update_clock_skew_from_server_date(server_date)?;
    Ok(())
}

fn update_clock_skew_from_server_date(server_date: &str) -> Result<(), EdgeTtsError> {
    let server_time = httpdate::parse_http_date(server_date).map_err(|error| {
        EdgeTtsError::auth(format!("failed to parse Edge TTS Date header: {error}"))
    })?;
    let server_millis = unix_millis(server_time)?;
    let client_millis = current_unix_millis_with_skew();
    CLOCK_SKEW_MILLIS.fetch_add(server_millis - client_millis, Ordering::AcqRel);
    Ok(())
}

fn prepare_text_segments(text: &str) -> Result<Vec<String>, EdgeTtsError> {
    split_escaped_text_by_byte_length(
        &xml_escape_text(&remove_incompatible_characters(text)),
        MAX_SSML_TEXT_BYTES,
    )
}

fn remove_incompatible_characters(text: &str) -> String {
    text.chars()
        .map(|character| {
            let code = character as u32;
            if (0..=8).contains(&code) || (11..=12).contains(&code) || (14..=31).contains(&code) {
                ' '
            } else {
                character
            }
        })
        .collect()
}

fn xml_escape_text(text: &str) -> String {
    text.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}

fn split_escaped_text_by_byte_length(
    text: &str,
    byte_length: usize,
) -> Result<Vec<String>, EdgeTtsError> {
    if byte_length == 0 {
        return Err(EdgeTtsError::protocol("split byte length must be positive"));
    }

    let mut remaining = text.trim();
    let mut chunks = Vec::new();

    while remaining.len() > byte_length {
        let mut split_at = find_last_newline_or_space_within_limit(remaining, byte_length)
            .unwrap_or_else(|| find_safe_utf8_split_point(remaining, byte_length));
        split_at = adjust_split_point_for_xml_entity(remaining, split_at);

        if split_at == 0 {
            return Err(EdgeTtsError::protocol(
                "unable to split Edge TTS text without cutting an XML entity",
            ));
        }

        let chunk = remaining[..split_at].trim();
        if !chunk.is_empty() {
            chunks.push(chunk.to_string());
        }
        remaining = remaining[split_at..].trim();
    }

    if !remaining.is_empty() {
        chunks.push(remaining.to_string());
    }

    Ok(chunks)
}

fn find_last_newline_or_space_within_limit(text: &str, limit: usize) -> Option<usize> {
    text.char_indices()
        .take_while(|(index, _)| *index < limit)
        .filter_map(|(index, character)| {
            if character == '\n' || character == ' ' {
                Some(index)
            } else {
                None
            }
        })
        .last()
}

fn find_safe_utf8_split_point(text: &str, limit: usize) -> usize {
    let mut split_at = limit.min(text.len());
    while split_at > 0 && !text.is_char_boundary(split_at) {
        split_at -= 1;
    }
    split_at
}

fn adjust_split_point_for_xml_entity(text: &str, split_at: usize) -> usize {
    let prefix = &text[..split_at];
    if let Some(ampersand_index) = prefix.rfind('&') {
        if !prefix[ampersand_index..].contains(';') {
            return ampersand_index;
        }
    }
    split_at
}

fn speech_config_message() -> String {
    format!(
        "X-Timestamp:{}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n{{\"context\":{{\"synthesis\":{{\"audio\":{{\"metadataoptions\":{{\"sentenceBoundaryEnabled\":\"true\",\"wordBoundaryEnabled\":\"false\"}},\"outputFormat\":\"{OUTPUT_FORMAT}\"}}}}}}}}\r\n",
        edge_timestamp()
    )
}

fn ssml_message(request: &EdgeTtsSynthesizeRequest, escaped_text: &str) -> String {
    format!(
        "X-RequestId:{}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:{}Z\r\nPath:ssml\r\n\r\n{}",
        new_connection_id(),
        edge_timestamp(),
        ssml(request, escaped_text)
    )
}

fn ssml(request: &EdgeTtsSynthesizeRequest, escaped_text: &str) -> String {
    format!(
        "<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'><voice name='{}'><prosody pitch='{}' rate='{}' volume='{}'>{}</prosody></voice></speak>",
        request.voice,
        request.pitch.as_deref().unwrap_or("+0Hz"),
        request.rate,
        request.volume,
        escaped_text
    )
}

fn edge_timestamp() -> String {
    let now = OffsetDateTime::now_utc();
    format!(
        "{} {} {:02} {} {:02}:{:02}:{:02} GMT+0000 (Coordinated Universal Time)",
        weekday_abbr(now.weekday()),
        month_abbr(now.month()),
        now.day(),
        now.year(),
        now.hour(),
        now.minute(),
        now.second()
    )
}

fn weekday_abbr(weekday: Weekday) -> &'static str {
    match weekday {
        Weekday::Monday => "Mon",
        Weekday::Tuesday => "Tue",
        Weekday::Wednesday => "Wed",
        Weekday::Thursday => "Thu",
        Weekday::Friday => "Fri",
        Weekday::Saturday => "Sat",
        Weekday::Sunday => "Sun",
    }
}

fn month_abbr(month: Month) -> &'static str {
    match month {
        Month::January => "Jan",
        Month::February => "Feb",
        Month::March => "Mar",
        Month::April => "Apr",
        Month::May => "May",
        Month::June => "Jun",
        Month::July => "Jul",
        Month::August => "Aug",
        Month::September => "Sep",
        Month::October => "Oct",
        Month::November => "Nov",
        Month::December => "Dec",
    }
}

fn parse_text_frame(text: &str) -> Result<TextFrame, EdgeTtsError> {
    let (headers, _) = parse_header_block(text.as_bytes())?;
    match headers.get("path").map(String::as_str) {
        Some("audio.metadata") => Ok(TextFrame::AudioMetadata),
        Some("response") => Ok(TextFrame::Response),
        Some("turn.start") => Ok(TextFrame::TurnStart),
        Some("turn.end") => Ok(TextFrame::TurnEnd),
        Some(path) => Err(EdgeTtsError::protocol(format!(
            "unknown Edge TTS text frame path: {path}"
        ))),
        None => Err(EdgeTtsError::protocol(
            "Edge TTS text frame did not include Path",
        )),
    }
}

fn parse_binary_audio_frame(data: &[u8]) -> Result<Option<Vec<u8>>, EdgeTtsError> {
    if data.len() < 2 {
        return Err(EdgeTtsError::protocol(
            "Edge TTS binary frame is missing header length",
        ));
    }

    let header_length = u16::from_be_bytes([data[0], data[1]]) as usize;
    if data.len() < 2 + header_length {
        return Err(EdgeTtsError::protocol(
            "Edge TTS binary frame header length exceeds frame length",
        ));
    }

    let header_block = &data[2..2 + header_length];
    let payload = &data[2 + header_length..];
    let (headers, header_data) = parse_header_block(header_block)?;

    if !header_data.is_empty() {
        return Err(EdgeTtsError::protocol(
            "Edge TTS binary frame header included unexpected data",
        ));
    }

    if headers.get("path").map(String::as_str) != Some("audio") {
        return Err(EdgeTtsError::protocol(
            "Edge TTS binary frame path is not audio",
        ));
    }

    match headers.get("content-type").map(String::as_str) {
        Some(MIME_TYPE) => {
            if payload.is_empty() {
                Err(EdgeTtsError::protocol(
                    "Edge TTS audio frame is missing audio data",
                ))
            } else {
                Ok(Some(payload.to_vec()))
            }
        }
        Some(content_type) => Err(EdgeTtsError::protocol(format!(
            "unexpected Edge TTS audio content type: {content_type}"
        ))),
        None if payload.is_empty() => Ok(None),
        None => Err(EdgeTtsError::protocol(
            "Edge TTS binary frame has data without Content-Type",
        )),
    }
}

fn parse_header_block(data: &[u8]) -> Result<(HashMap<String, String>, &[u8]), EdgeTtsError> {
    let separator = data
        .windows(4)
        .position(|window| window == b"\r\n\r\n")
        .ok_or_else(|| EdgeTtsError::protocol("Edge TTS frame is missing header terminator"))?;

    let header_bytes = &data[..separator];
    let payload = &data[separator + 4..];
    let header_text = std::str::from_utf8(header_bytes)
        .map_err(|error| EdgeTtsError::protocol(format!("frame headers are not UTF-8: {error}")))?;
    let mut headers = HashMap::new();

    if !header_text.is_empty() {
        for line in header_text.split("\r\n") {
            let (key, value) = line
                .split_once(':')
                .ok_or_else(|| EdgeTtsError::protocol("malformed Edge TTS frame header"))?;
            headers.insert(key.trim().to_ascii_lowercase(), value.trim().to_string());
        }
    }

    Ok((headers, payload))
}
