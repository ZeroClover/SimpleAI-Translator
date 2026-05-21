use enigo::*;
use parking_lot::Mutex;
use tauri::Emitter;
#[cfg(target_os = "macos")]
use tauri::Manager;
#[cfg(target_os = "macos")]
use tauri::path::BaseDirectory;

use crate::APP_HANDLE;

static SELECT_ALL: Mutex<()> = Mutex::new(());

#[allow(dead_code)]
#[cfg(not(target_os = "macos"))]
pub fn select_all(enigo: &mut Enigo) {
    let _guard = SELECT_ALL.lock();

    up_control_keys(enigo);

    enigo.key(Key::Control, Direction::Press).unwrap();
    #[cfg(target_os = "windows")]
    enigo.key(Key::A, Direction::Click).unwrap();
    #[cfg(target_os = "linux")]
    enigo.key(Key::Unicode('a'), Direction::Click).unwrap();
    enigo.key(Key::Control, Direction::Release).unwrap();
}

#[allow(dead_code)]
#[cfg(target_os = "macos")]
pub fn select_all(_enigo: &mut Enigo) {
    let _guard = SELECT_ALL.lock();

    let apple_script = APP_HANDLE
        .get()
        .unwrap()
        .path()
        .resolve("resources/select-all.applescript", BaseDirectory::Resource)
        .expect("failed to resolve select-all.applescript");

    std::process::Command::new("osascript")
        .arg(apple_script)
        .spawn()
        .expect("failed to run applescript")
        .wait()
        .expect("failed to wait");
}

pub static INPUT_LOCK: Mutex<()> = Mutex::new(());

#[allow(dead_code)]
#[cfg(not(target_os = "macos"))]
pub fn up_control_keys(enigo: &mut Enigo) {
    enigo.key(Key::Control, Direction::Release).unwrap();
    enigo.key(Key::Alt, Direction::Release).unwrap();
    enigo.key(Key::Shift, Direction::Release).unwrap();
    enigo.key(Key::Space, Direction::Release).unwrap();
    enigo.key(Key::Tab, Direction::Release).unwrap();
}

#[allow(dead_code)]
#[cfg(target_os = "macos")]
pub fn up_control_keys(enigo: &mut Enigo) {
    enigo.key(Key::Control, Direction::Release).unwrap();
    enigo.key(Key::Meta, Direction::Release).unwrap();
    enigo.key(Key::Alt, Direction::Release).unwrap();
    enigo.key(Key::Shift, Direction::Release).unwrap();
    enigo.key(Key::Space, Direction::Release).unwrap();
    enigo.key(Key::Tab, Direction::Release).unwrap();
    enigo.key(Key::Option, Direction::Release).unwrap();
}

static COPY_PASTE: Mutex<()> = Mutex::new(());

#[allow(dead_code)]
#[cfg(not(target_os = "macos"))]
pub fn paste(enigo: &mut Enigo) {
    let _guard = COPY_PASTE.lock();

    up_control_keys(enigo);

    enigo.key(Key::Control, Direction::Press).unwrap();
    #[cfg(target_os = "windows")]
    enigo.key(Key::V, Direction::Click).unwrap();
    #[cfg(target_os = "linux")]
    enigo.key(Key::Unicode('v'), Direction::Click).unwrap();
    enigo.key(Key::Control, Direction::Release).unwrap();
}

#[allow(dead_code)]
#[cfg(target_os = "macos")]
pub fn paste(_enigo: &mut Enigo) {
    let _guard = COPY_PASTE.lock();

    let apple_script = APP_HANDLE
        .get()
        .unwrap()
        .path()
        .resolve("resources/paste.applescript", BaseDirectory::Resource)
        .expect("failed to resolve paste.applescript");

    std::process::Command::new("osascript")
        .arg(apple_script)
        .spawn()
        .expect("failed to run applescript")
        .wait()
        .expect("failed to wait");
}

pub fn send_text(text: String) {
    match APP_HANDLE.get() {
        Some(handle) => handle.emit("change-text", text).unwrap_or_default(),
        None => {}
    }
}

pub fn show() {
    match APP_HANDLE.get() {
        Some(handle) => handle.emit("show", "").unwrap_or_default(),
        None => {}
    }
}
