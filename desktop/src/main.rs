#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod bridge;

use tauri::Manager;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(bridge::ToolchainState::new())
        .invoke_handler(tauri::generate_handler![
            bridge::bridge_info,
            bridge::compile_jspp,
            bridge::run_cpp_native,
            bridge::open_browser,
            bridge::pick_toolchain,
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let state: tauri::State<bridge::ToolchainState> = handle.state();
                state.detect().await;
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running ZeroEngine");
}

