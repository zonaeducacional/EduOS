#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{
    webview::{PermissionKind, PermissionResponse},
    Manager, WebviewWindowBuilder,
};

mod builtins;
mod native_apps;
mod bundled;
mod runtime;
mod shop;
mod vibelab;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(shop::Shop::default())
        .manage(native_apps::NativeApps::default())
        .manage(bundled::Servers::default())
        .manage(builtins::MicrophoneGrant::default())
        .setup(|app| {
            let config = app
                .config()
                .app
                .windows
                .iter()
                .find(|config| config.label == "main")
                .ok_or("A janela principal do EduOS está ausente.")?;
            WebviewWindowBuilder::from_config(app, config)?
                .on_permission_request(|webview, permission| match permission {
                    PermissionKind::Microphone
                        if webview.state::<builtins::MicrophoneGrant>().take() =>
                    {
                        PermissionResponse::Allow
                    }
                    PermissionKind::Microphone
                    | PermissionKind::Camera
                    | PermissionKind::DisplayCapture => PermissionResponse::Deny,
                    _ => PermissionResponse::Default,
                })
                .build()?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            shop::shop_has_key,
            shop::shop_unlock,
            shop::shop_lock,
            shop::studio_select,
            shop::studio_sign,
            shop::studio_export,
            shop::studio_public,
            shop::shop_trust_local,
            shop::shop_trust_file,
            shop::shop_select,
            shop::shop_install,
            shop::shop_list,
            shop::shop_change,
            shop::shop_publish,
            shop::shop_publications,
            shop::shop_unpublish,
            shop::catalog_list,
            shop::catalog_install,
            runtime::runtime_list,
            runtime::runtime_event,
            builtins::builtin_files,
            native_apps::native_app_open,
            native_apps::native_app_can_switch,
            vibelab::vibelab_open,
            vibelab::vibelab_close,
            vibelab::vibelab_files,
            vibelab::vibelab_transfer,
            vibelab::vibelab_window,
            builtins::builtin_save_text,
            builtins::builtin_save_binary,
            builtins::builtin_microphone,
            builtins::builtin_open_office,
            builtins::builtin_close_office,
            bundled::builtin_open_bundled,
            bundled::builtin_close_bundled,
        ])
        .run(tauri::generate_context!())
        .expect("Não foi possível iniciar o EduOS");
}
