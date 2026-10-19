use parking_lot::Mutex;
use tauri::AppHandle;
use tauri::Manager;

use serde::{Deserialize, Serialize};

use crate::APP_HANDLE;

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone, specta::Type, tauri_specta::Event)]
pub struct ConfigUpdatedEvent;

#[derive(Debug, Serialize, Deserialize, Clone, specta::Type)]
#[allow(clippy::upper_case_acronyms)]
pub enum ProxyProtocol {
    HTTP,
    HTTPS,
}

#[derive(Debug, Serialize, Deserialize, Clone, specta::Type)]
pub struct BasicAuth {
    pub username: Option<String>,
    pub password: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ProxyConfig {
    pub enabled: Option<bool>,
    pub protocol: Option<ProxyProtocol>,
    pub server: Option<String>,
    pub port: Option<String>,
    pub basic_auth: Option<BasicAuth>,
    pub no_proxy: Option<String>,
}

/// Builds the proxy for native requests, or `None` when the proxy is disabled or incomplete.
pub fn reqwest_proxy(config: &ProxyConfig) -> Result<Option<reqwest::Proxy>, String> {
    if !config.enabled.unwrap_or(false) {
        return Ok(None);
    }
    let non_empty = |value: &Option<String>| value.clone().filter(|value| !value.is_empty());
    let (Some(protocol), Some(server), Some(port)) = (
        config.protocol.as_ref(),
        non_empty(&config.server),
        non_empty(&config.port),
    ) else {
        return Ok(None);
    };
    let scheme = match protocol {
        ProxyProtocol::HTTP => "http",
        ProxyProtocol::HTTPS => "https",
    };
    let mut proxy = reqwest::Proxy::all(format!("{scheme}://{server}:{port}"))
        .map_err(|error| format!("invalid proxy URL: {error}"))?;
    if let Some(basic_auth) = &config.basic_auth {
        let username = basic_auth.username.as_deref().unwrap_or_default();
        if !username.is_empty() {
            proxy = proxy.basic_auth(username, basic_auth.password.as_deref().unwrap_or_default());
        }
    }
    if let Some(no_proxy) = config.no_proxy.as_deref() {
        proxy = proxy.no_proxy(reqwest::NoProxy::from_string(no_proxy));
    }
    Ok(Some(proxy))
}

#[derive(Debug, Default, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Config {
    pub restore_previous_position: Option<bool>,
    pub automatic_check_for_updates: Option<bool>,
    pub proxy: Option<ProxyConfig>,
}

static CONFIG_CACHE: Mutex<Option<Config>> = Mutex::new(None);
// Serializes every read and update of config.json across all windows of this process.
static CONFIG_FILE: Mutex<()> = Mutex::new(());

pub fn get_config() -> Result<Config, Box<dyn std::error::Error>> {
    let app_handle = APP_HANDLE.get().unwrap();
    get_config_by_app(app_handle)
}

pub fn get_config_by_app(app: &AppHandle) -> Result<Config, Box<dyn std::error::Error>> {
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

/// Merges `set_json` (a JSON object) into config.json as one atomic update, so concurrent saves
/// from different windows never overwrite each other's keys.
#[tauri::command]
#[specta::specta]
pub fn update_config(set_json: String) -> Result<(), String> {
    let app = APP_HANDLE.get().ok_or("App is not initialized")?;
    let set = serde_json::from_str(&set_json).map_err(|e| e.to_string())?;
    update_config_file(&config_path_by_app(app)?, set)?;
    clear_config_cache();
    Ok(())
}

pub fn get_config_content_by_app(app: &AppHandle) -> Result<String, String> {
    let config_path = config_path_by_app(app)?;
    let _guard = CONFIG_FILE.lock();
    read_config_file(&config_path)
}

fn config_path_by_app(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let app_config_dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&app_config_dir).map_err(|e| e.to_string())?;
    Ok(app_config_dir.join("config.json"))
}

fn update_config_file(
    path: &std::path::Path,
    set: serde_json::Map<String, serde_json::Value>,
) -> Result<(), String> {
    let _guard = CONFIG_FILE.lock();
    let mut config: serde_json::Map<String, serde_json::Value> =
        serde_json::from_str(&read_config_file(path)?).map_err(|e| e.to_string())?;
    config.extend(set);
    let content = serde_json::to_string(&config).map_err(|e| e.to_string())?;
    let temporary_path = path.with_file_name(format!("config.{}.tmp", uuid::Uuid::new_v4()));
    let result = std::fs::write(&temporary_path, content)
        .and_then(|_| std::fs::rename(&temporary_path, path));
    if result.is_err() {
        let _ = std::fs::remove_file(&temporary_path);
    }
    result.map_err(|e| e.to_string())
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
        // Truncated JSON fails the JSON check; a truncated multi-byte character fails UTF-8 decoding.
        let corruptions: &[&[u8]] = &[b"{\"providers\":", b"{\"provider\":\"\xe4\xb8"];
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
    fn keep_every_key_from_concurrent_updates() {
        let dir = std::env::temp_dir().join(format!("simpleai-config-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("config.json");
        std::fs::write(&path, "{\"fontSize\":15}").unwrap();
        let writers: Vec<_> = (0..16)
            .map(|index| {
                let path = path.clone();
                std::thread::spawn(move || {
                    let set = serde_json::json!({ format!("key{index}"): index });
                    update_config_file(&path, set.as_object().unwrap().clone()).unwrap();
                })
            })
            .collect();
        for writer in writers {
            writer.join().unwrap();
        }

        let config: serde_json::Map<String, serde_json::Value> =
            serde_json::from_str(&std::fs::read_to_string(&path).unwrap()).unwrap();
        assert_eq!(config["fontSize"], 15);
        for index in 0..16 {
            assert_eq!(config[&format!("key{index}")], index);
        }
        assert_eq!(std::fs::read_dir(&dir).unwrap().count(), 1);
        std::fs::remove_dir_all(dir).unwrap();
    }
}
