use serde::{Deserialize, Serialize};
use std::fmt;

pub(crate) const BASE_URL: &str = "speech.platform.bing.com/consumer/speech/synthesize/readaloud";
pub(crate) const TRUSTED_CLIENT_TOKEN: &str = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
pub(crate) const WSS_URL: &str =
    "wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1";
pub(crate) const VOICE_LIST_URL: &str =
    "https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/voices/list";
pub(crate) const CHROMIUM_FULL_VERSION: &str = "143.0.3650.75";
pub(crate) const CHROMIUM_MAJOR_VERSION: &str = "143";
pub(crate) const SEC_MS_GEC_VERSION: &str = "1-143.0.3650.75";
pub(crate) const OUTPUT_FORMAT: &str = "audio-24khz-48kbitrate-mono-mp3";
pub(crate) const EDGE_ORIGIN: &str = "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold";

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
}

impl EdgeTtsError {
    pub(crate) fn new(kind: EdgeTtsErrorKind, message: impl Into<String>) -> Self {
        Self {
            kind,
            message: message.into(),
        }
    }

    pub(crate) fn protocol(message: impl Into<String>) -> Self {
        Self::new(EdgeTtsErrorKind::Protocol, message)
    }

    pub(crate) fn into_command_error(self) -> String {
        format!("{}: {}", self.kind.as_str(), self.message)
    }
}

#[tauri::command]
#[specta::specta]
pub async fn edge_tts_list_voices() -> Result<Vec<EdgeTtsVoice>, String> {
    Err(EdgeTtsError::protocol("Edge TTS protocol implementation is pending")
        .into_command_error())
}

#[tauri::command]
#[specta::specta]
pub async fn edge_tts_synthesize(
    _request: EdgeTtsSynthesizeRequest,
) -> Result<EdgeTtsSynthesizeResult, String> {
    Err(EdgeTtsError::protocol("Edge TTS protocol implementation is pending")
        .into_command_error())
}
