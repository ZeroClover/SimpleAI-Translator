use crate::config;
use crate::ALWAYS_ON_TOP;
use crate::APP_HANDLE;
use crate::{check_update, UpdateResult};
use debug_print::debug_println;
use mouse_position::mouse_position::Mouse;
use std::sync::atomic::Ordering;
use tauri::{Listener, LogicalPosition, Manager, PhysicalPosition};
use tauri_specta::Event;

pub const TRANSLATOR_WIN_NAME: &str = "translator";
pub const SETTINGS_WIN_NAME: &str = "settings";
pub const UPDATER_WIN_NAME: &str = "updater";
pub const HISTORY_WIN_NAME: &str = "history";

fn get_dummy_window() -> tauri::WebviewWindow {
    let app_handle = APP_HANDLE.get().unwrap();
    match app_handle.get_webview_window("dummy") {
        Some(window) => {
            debug_println!("Dummy window found!");
            window
        }
        None => {
            debug_println!("Create dummy window!");
            checked_build(
                tauri::WebviewWindowBuilder::new(
                    app_handle,
                    "dummy",
                    tauri::WebviewUrl::App("src/tauri/dummy.html".into()),
                )
                .title("Dummy")
                .visible(false),
            )
        }
    }
}

pub fn get_current_monitor() -> tauri::Monitor {
    let window = get_dummy_window();
    let (mouse_logical_x, mouse_logical_y): (i32, i32) = get_mouse_location().unwrap();
    let scale_factor = window.scale_factor().unwrap_or(1.0);
    let mut mouse_physical_position = PhysicalPosition::new(mouse_logical_x, mouse_logical_y);
    if cfg!(target_os = "macos") {
        mouse_physical_position =
            LogicalPosition::new(mouse_logical_x as f64, mouse_logical_y as f64)
                .to_physical(scale_factor);
    }
    window
        .available_monitors()
        .map(|monitors| {
            monitors
                .iter()
                .find(|monitor| {
                    let monitor_physical_size = monitor.size();
                    let monitor_physical_position = monitor.position();
                    mouse_physical_position.x >= monitor_physical_position.x
                        && mouse_physical_position.x
                            <= monitor_physical_position.x + (monitor_physical_size.width as i32)
                        && mouse_physical_position.y >= monitor_physical_position.y
                        && mouse_physical_position.y
                            <= monitor_physical_position.y + (monitor_physical_size.height as i32)
                })
                .cloned()
        })
        .unwrap_or_else(|e| {
            eprintln!("Error get available monitors: {}", e);
            None
        })
        .or_else(|| window.current_monitor().unwrap())
        .or_else(|| window.primary_monitor().unwrap())
        .expect("No current monitor found")
}

pub fn get_mouse_location() -> Result<(i32, i32), String> {
    let position = Mouse::get_mouse_position();
    match position {
        Mouse::Position { x, y } => Ok((x, y)),
        Mouse::Error => Err("Error getting mouse position".to_string()),
    }
}

pub fn set_translator_window_always_on_top() -> bool {
    let handle = APP_HANDLE.get().unwrap();
    if let Some(window) = handle.get_webview_window(TRANSLATOR_WIN_NAME) {
        let always_on_top = ALWAYS_ON_TOP.load(Ordering::Acquire);

        if !always_on_top {
            window.set_always_on_top(true).unwrap();
            ALWAYS_ON_TOP.store(true, Ordering::Release);
        } else {
            window.set_always_on_top(false).unwrap();
            ALWAYS_ON_TOP.store(false, Ordering::Release);
        }
        ALWAYS_ON_TOP.load(Ordering::Acquire)
    } else {
        false
    }
}

#[tauri::command]
#[specta::specta]
pub fn get_translator_window_always_on_top() -> bool {
    ALWAYS_ON_TOP.load(Ordering::Acquire)
}

pub fn do_hide_translator_window() {
    if let Some(handle) = APP_HANDLE.get() {
        if let Some(window) = handle.get_webview_window(TRANSLATOR_WIN_NAME) {
            #[cfg(not(target_os = "macos"))]
            {
                window.hide().unwrap();
            }
            #[cfg(target_os = "macos")]
            {
                tauri::AppHandle::hide(handle).unwrap();
                window.hide().unwrap();
            }
        }
    }
}

// On macOS this also sets the CanJoinAllSpaces collection behavior. Tauri already turns off
// automatic window tabbing for windows without a tabbing identifier.
pub fn post_process_window<R: tauri::Runtime>(window: &tauri::WebviewWindow<R>) {
    window.set_visible_on_all_workspaces(true).unwrap();

    let _ = window.current_monitor();
}

#[cfg(target_os = "windows")]
pub fn show_webview_startup_error(detail: &str) {
    use windows::core::PCWSTR;
    use windows::Win32::UI::WindowsAndMessaging::{
        MessageBoxW, IDOK, MB_ICONERROR, MB_OKCANCEL, MB_SETFOREGROUND,
    };

    let text: Vec<u16> = format!(
        "SimpleAI Translator could not create its interface. The Microsoft Edge WebView2 Runtime may be missing or damaged.\n\nClick OK to open Microsoft's WebView2 download page. Install or repair the runtime, then try again.\n\nTechnical detail: {detail}"
    )
    .encode_utf16()
    .chain(std::iter::once(0))
    .collect();
    let caption: Vec<u16> = "SimpleAI Translator\0".encode_utf16().collect();
    let pressed = unsafe {
        MessageBoxW(
            None,
            PCWSTR(text.as_ptr()),
            PCWSTR(caption.as_ptr()),
            MB_OKCANCEL | MB_ICONERROR | MB_SETFOREGROUND,
        )
    };
    if pressed == IDOK {
        let _ = std::process::Command::new("rundll32")
            .args([
                "url.dll,FileProtocolHandler",
                "https://developer.microsoft.com/microsoft-edge/webview2/",
            ])
            .spawn();
    }
}

fn checked_build<R: tauri::Runtime, M: tauri::Manager<R>>(
    builder: tauri::WebviewWindowBuilder<'_, R, M>,
) -> tauri::WebviewWindow<R> {
    builder.build().unwrap_or_else(|error| {
        #[cfg(target_os = "windows")]
        {
            show_webview_startup_error(&error.to_string());
            std::process::exit(1);
        }
        #[cfg(not(target_os = "windows"))]
        panic!("failed to create webview window: {error}");
    })
}

pub fn build_window<'a, R: tauri::Runtime, M: tauri::Manager<R>>(
    builder: tauri::WebviewWindowBuilder<'a, R, M>,
) -> tauri::WebviewWindow<R> {
    #[cfg(target_os = "macos")]
    {
        let window = checked_build(
            builder
                .title_bar_style(tauri::TitleBarStyle::Overlay)
                .hidden_title(true)
                .transparent(true),
        );

        post_process_window(&window);

        window
    }

    #[cfg(not(target_os = "macos"))]
    {
        let window = checked_build(builder.transparent(true).decorations(true));

        post_process_window(&window);

        window
    }
}

pub fn show_translator_window(to_mouse_position: bool, set_focus: bool) -> tauri::WebviewWindow {
    let window = get_translator_window(to_mouse_position, set_focus);
    window.show().unwrap();
    window
}

pub fn get_translator_window(to_mouse_position: bool, set_focus: bool) -> tauri::WebviewWindow {
    let current_monitor = get_current_monitor();
    let handle = APP_HANDLE.get().unwrap();
    let window = match handle.get_webview_window(TRANSLATOR_WIN_NAME) {
        Some(window) => {
            window.unminimize().unwrap();
            if set_focus {
                window.set_focus().unwrap();
            }
            window
        }
        None => {
            let builder = tauri::WebviewWindowBuilder::new(
                handle,
                TRANSLATOR_WIN_NAME,
                tauri::WebviewUrl::App("src/tauri/index.html".into()),
            )
            .title("SimpleAI Translator")
            .fullscreen(false)
            .inner_size(620.0, 700.0)
            .min_inner_size(540.0, 600.0)
            .resizable(true)
            .skip_taskbar(false)
            .visible(false)
            .focused(false);

            build_window(builder)
        }
    };

    let restore_previous_position = match config::get_config() {
        Ok(config) => config.restore_previous_position.unwrap_or(false),
        Err(e) => {
            eprintln!("Error getting config: {}", e);
            false
        }
    };

    if restore_previous_position {
        debug_println!("Restoring previous position");
        if !cfg!(target_os = "macos") {
            window.unminimize().unwrap();
        }
    } else if to_mouse_position {
        debug_println!("Setting position to mouse position");
        let (mouse_logical_x, mouse_logical_y): (i32, i32) = get_mouse_location().unwrap();
        let window_physical_size = window.outer_size().unwrap();
        let scale_factor = window.scale_factor().unwrap_or(1.0);
        let mut mouse_physical_position = PhysicalPosition::new(mouse_logical_x, mouse_logical_y);
        if cfg!(target_os = "macos") {
            mouse_physical_position =
                LogicalPosition::new(mouse_logical_x as f64, mouse_logical_y as f64)
                    .to_physical(scale_factor);
        }

        let monitor_physical_size = current_monitor.size();
        let monitor_physical_position = current_monitor.position();

        let mut window_physical_position = mouse_physical_position;
        if mouse_physical_position.x + (window_physical_size.width as i32)
            > monitor_physical_position.x + (monitor_physical_size.width as i32)
        {
            window_physical_position.x = monitor_physical_position.x
                + (monitor_physical_size.width as i32)
                - (window_physical_size.width as i32);
        }
        if mouse_physical_position.y + (window_physical_size.height as i32)
            > monitor_physical_position.y + (monitor_physical_size.height as i32)
        {
            window_physical_position.y = monitor_physical_position.y
                + (monitor_physical_size.height as i32)
                - (window_physical_size.height as i32);
        }
        if !cfg!(target_os = "macos") {
            window.unminimize().unwrap();
        }
        debug_println!("Mouse physical position: {:?}", mouse_physical_position);
        debug_println!("Monitor physical size: {:?}", monitor_physical_size);
        debug_println!("Monitor physical position: {:?}", monitor_physical_position);
        debug_println!("Window physical size: {:?}", window_physical_size);
        debug_println!("Window physical position: {:?}", window_physical_position);
        window.set_position(window_physical_position).unwrap();
    }

    window
}

#[tauri::command]
#[specta::specta]
pub async fn show_history_window() {
    let window = get_or_create_window(
        HISTORY_WIN_NAME,
        "SimpleAI Translator History",
        (760.0, 720.0),
        (660.0, 600.0),
    );
    window.center().unwrap();
    window.show().unwrap();
}

pub fn show_settings_window() {
    let window = get_or_create_window(
        SETTINGS_WIN_NAME,
        "SimpleAI Translator Settings",
        (660.0, 800.0),
        (660.0, 600.0),
    );
    window.center().unwrap();
    window.show().unwrap();
}

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone, specta::Type, tauri_specta::Event)]
pub struct CheckUpdateResultEvent(Option<UpdateResult>);

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone, specta::Type, tauri_specta::Event)]
pub struct CheckUpdateEvent;

pub fn show_updater_window() {
    let window = get_or_create_window(
        UPDATER_WIN_NAME,
        "SimpleAI Translator Updater",
        (500.0, 500.0),
        (200.0, 200.0),
    );
    window.center().unwrap();
    window.show().unwrap();

    let handle = APP_HANDLE.get().unwrap();
    CheckUpdateEvent::listen(handle, move |event| {
        let window_clone = window.clone();
        tauri::async_runtime::spawn(async move {
            // A failed check sends nothing: the window would show `None` as "up to date".
            if let Ok(result) = check_update(handle).await {
                CheckUpdateResultEvent(result).emit(handle).unwrap();
            }
            window_clone.unlisten(event.id)
        });
    });
}

/// Returns the window with `label`, focusing it, or creates it hidden.
fn get_or_create_window(
    label: &str,
    title: &str,
    (width, height): (f64, f64),
    (min_width, min_height): (f64, f64),
) -> tauri::WebviewWindow {
    let handle = APP_HANDLE.get().unwrap();
    if let Some(window) = handle.get_webview_window(label) {
        window.unminimize().unwrap();
        window.set_focus().unwrap();
        return window;
    }
    build_window(
        tauri::WebviewWindowBuilder::new(
            handle,
            label,
            tauri::WebviewUrl::App("src/tauri/index.html".into()),
        )
        .title(title)
        .fullscreen(false)
        .inner_size(width, height)
        .min_inner_size(min_width, min_height)
        .resizable(true)
        .skip_taskbar(true)
        .focused(true),
    )
}
