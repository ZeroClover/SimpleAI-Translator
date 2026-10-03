use parking_lot::Mutex;
use tauri::AppHandle;
use tauri::Manager;

use serde::{Deserialize, Serialize};

use crate::APP_HANDLE;

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone, specta::Type, tauri_specta::Event)]
pub struct ConfigUpdatedEvent;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[allow(clippy::upper_case_acronyms)]
pub enum ProxyProtocol {
    HTTP,
    HTTPS,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BasicAuth {
    pub username: Option<String>,
    pub password: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ProxyConfig {
    pub enabled: Option<bool>,
    pub protocol: Option<ProxyProtocol>,
    pub server: Option<String>,
    pub port: Option<String>,
    pub basic_auth: Option<BasicAuth>,
    pub no_proxy: Option<String>,
}

#[derive(Debug, Default, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Config {
    pub restore_previous_position: Option<bool>,
    pub allow_using_clipboard_when_selected_text_not_available: Option<bool>,
    pub automatic_check_for_updates: Option<bool>,
    pub proxy: Option<ProxyConfig>,
}

static CONFIG_CACHE: Mutex<Option<Config>> = Mutex::new(None);

pub fn get_config() -> Result<Config, Box<dyn std::error::Error>> {
    let app_handle = APP_HANDLE.get().unwrap();
    get_config_by_app(app_handle)
}

pub fn get_config_by_app(app: &AppHandle) -> Result<Config, Box<dyn std::error::Error>> {
    let conf = _get_config_by_app(app);
    match conf {
        Ok(conf) => Ok(conf),
        Err(e) => {
            println!("get config failed: {}", e);
            Err(e)
        }
    }
}

pub fn _get_config_by_app(app: &AppHandle) -> Result<Config, Box<dyn std::error::Error>> {
    if let Some(config_cache) = &*CONFIG_CACHE.lock() {
        return Ok(config_cache.clone());
    }
    let config_content = get_config_content_by_app(app)?;
    let config: Config = serde_json::from_str(&config_content).unwrap_or_else(|error| {
        eprintln!("Invalid config fields, using native defaults: {error}");
        Config::default()
    });
    CONFIG_CACHE.lock().replace(config.clone());
    Ok(config)
}

#[tauri::command]
#[specta::specta]
pub fn clear_config_cache() {
    CONFIG_CACHE.lock().take();
}

#[tauri::command]
#[specta::specta]
pub fn get_config_content() -> String {
    if let Some(app) = APP_HANDLE.get() {
        get_config_content_by_app(app).unwrap_or_else(|error| {
            eprintln!("Failed to read config: {error}");
            "{}".to_string()
        })
    } else {
        "{}".to_string()
    }
}

pub fn get_config_content_by_app(app: &AppHandle) -> Result<String, String> {
    let app_config_dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&app_config_dir).map_err(|e| e.to_string())?;
    let config_path = app_config_dir.join("config.json");
    read_config_file(&config_path)
}

fn read_config_file(path: &std::path::Path) -> Result<String, String> {
    let content = match std::fs::read(path) {
        Ok(content) => content,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            std::fs::write(path, "{}").map_err(|e| e.to_string())?;
            return Ok("{}".to_string());
        }
        Err(error) => return Err(error.to_string()),
    };
    if let Ok(content) = String::from_utf8(content) {
        if serde_json::from_str::<serde_json::Map<String, serde_json::Value>>(&content).is_ok() {
            return Ok(content);
        }
    }
    let backup = path.with_file_name(format!("config.{}.corrupted", uuid::Uuid::new_v4()));
    std::fs::rename(path, backup).map_err(|e| e.to_string())?;
    std::fs::write(path, "{}").map_err(|e| e.to_string())?;
    Ok("{}".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn preserve_invalid_config_before_recovery() {
        let dir = std::env::temp_dir().join(format!("simpleai-config-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("config.json");
        let corruptions: &[&[u8]] = &[
            b"{\"providers\":",
            b"null",
            b"[]",
            b"{\"provider\":\"\xff\"}",
            b"{\"provider\":\"\xe4\xb8",
        ];
        for content in corruptions {
            std::fs::write(&path, content).unwrap();
            assert_eq!(read_config_file(&path).unwrap(), "{}");
            assert_eq!(std::fs::read_to_string(&path).unwrap(), "{}");
            assert!(std::fs::read_dir(&dir).unwrap().any(|entry| {
                let path = entry.unwrap().path();
                path.extension()
                    .is_some_and(|extension| extension == "corrupted")
                    && std::fs::read(path).unwrap() == *content
            }));
        }
        assert_eq!(
            std::fs::read_dir(&dir).unwrap().count(),
            corruptions.len() + 1
        );
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn keep_valid_config_and_initialize_missing_config() {
        let dir = std::env::temp_dir().join(format!("simpleai-config-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("config.json");
        assert_eq!(read_config_file(&path).unwrap(), "{}");
        let content = "{\"fontSize\":20,\"providers\":[]}";
        std::fs::write(&path, content).unwrap();
        assert_eq!(read_config_file(&path).unwrap(), content);
        assert_eq!(std::fs::read_dir(&dir).unwrap().count(), 1);
        std::fs::remove_dir_all(dir).unwrap();
    }
}
