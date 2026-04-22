#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod bridge;
mod bridge_server;

use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::{Emitter, Manager};

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .manage(bridge::ToolchainState::new())
        .invoke_handler(tauri::generate_handler![
            bridge::bridge_info,
            bridge::compile_jspp,
            bridge::run_cpp_native,
            bridge::compile_and_run,
            bridge::open_browser,
            bridge::pick_toolchain,
            bridge::read_text_file,
            bridge::save_text_file,
            bridge::load_zeroapp,
        ])
        .setup(|app| {
            // Build native menu: File / View / Help.
            let new_browser = MenuItemBuilder::with_id("menu.new-browser", "New Browser Window")
                .accelerator("CmdOrCtrl+N")
                .build(app)?;
            let playground = MenuItemBuilder::with_id("menu.playground", "JSPP Playground")
                .accelerator("CmdOrCtrl+P")
                .build(app)?;
            let home = MenuItemBuilder::with_id("menu.home", "Home")
                .accelerator("CmdOrCtrl+H")
                .build(app)?;
            let quit = MenuItemBuilder::with_id("menu.quit", "Quit ZeroEngine")
                .accelerator("CmdOrCtrl+Q")
                .build(app)?;
            let file = SubmenuBuilder::new(app, "File")
                .items(&[&new_browser, &playground, &home])
                .separator()
                .item(&quit)
                .build()?;

            let reload = MenuItemBuilder::with_id("menu.reload", "Reload")
                .accelerator("CmdOrCtrl+R")
                .build(app)?;
            let devtools = MenuItemBuilder::with_id("menu.devtools", "Toggle Developer Tools")
                .accelerator("F12")
                .build(app)?;
            let view = SubmenuBuilder::new(app, "View")
                .items(&[&reload, &devtools])
                .build()?;

            let about = MenuItemBuilder::with_id("menu.about", "About ZeroEngine").build(app)?;
            let repo = MenuItemBuilder::with_id("menu.repo", "Open GitHub repository").build(app)?;
            let help = SubmenuBuilder::new(app, "Help")
                .items(&[&about, &repo])
                .build()?;

            let menu = MenuBuilder::new(app).items(&[&file, &view, &help]).build()?;
            app.set_menu(menu)?;

            let app_handle_for_menu = app.handle().clone();
            app.on_menu_event(move |app, event| {
                let id = event.id().as_ref();
                match id {
                    "menu.quit" => {
                        app.exit(0);
                    }
                    "menu.home" => {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.emit("menu://navigate", "shell.html");
                        }
                    }
                    "menu.playground" => {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.emit("menu://navigate", "jspp.html");
                        }
                    }
                    "menu.new-browser" => {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.emit("menu://new-browser", "");
                        }
                    }
                    "menu.reload" => {
                        if let Some(w) = focused_webview(app) {
                            let _ = w.eval("location.reload()");
                        }
                    }
                    "menu.devtools" => {
                        #[cfg(debug_assertions)]
                        if let Some(w) = focused_webview(app) {
                            if w.is_devtools_open() {
                                w.close_devtools();
                            } else {
                                w.open_devtools();
                            }
                        }
                        #[cfg(not(debug_assertions))]
                        { let _ = app; }
                    }
                    "menu.about" => {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.emit("menu://about", "");
                        }
                    }
                    "menu.repo" => {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.emit(
                                "menu://open-url",
                                "https://github.com/StefanDjurkic/zeroengine",
                            );
                        }
                    }
                    _ => {}
                }
                let _ = &app_handle_for_menu;
            });

            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let state: tauri::State<bridge::ToolchainState> = handle.state();
                state.detect().await;
            });

            // Start the local HTTP bridge server so the web build of the
            // playground (GitHub Pages, file://, etc.) can use this desktop
            // app's native toolchain. Binds only to 127.0.0.1 and validates
            // Origin against a hardcoded allowlist.
            let handle_http = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let state: tauri::State<bridge::ToolchainState> = handle_http.state();
                let shared = state.inner().clone();
                match bridge_server::start(shared, bridge_server::DEFAULT_PORT).await {
                    Ok(addr) => {
                        eprintln!("[bridge_server] listening on http://{}", addr);
                        if let Some(w) = handle_http.get_webview_window("main") {
                            let _ = w.emit(
                                "bridge://server-ready",
                                serde_json::json!({ "addr": addr.to_string() }),
                            );
                        }
                    }
                    Err(e) => eprintln!("[bridge_server] failed to start: {e}"),
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running ZeroEngine");
}

fn focused_webview<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Option<tauri::WebviewWindow<R>> {
    for (_, w) in app.webview_windows() {
        if w.is_focused().unwrap_or(false) {
            return Some(w);
        }
    }
    app.get_webview_window("main")
}

