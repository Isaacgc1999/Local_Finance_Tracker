//! Shell de escritorio de Fintrack.
//!
//! Registra los plugins de Tauri que usa la app y el único comando propio,
//! `db_transaction` (módulo `db_tx`). Los permisos concretos (rutas del
//! sistema de ficheros, URLs HTTP permitidas) viven en
//! `capabilities/default.json`; aquí no hay lógica de negocio.
//!
//! Instancia única: pulsar un aviso de Windows (o abrir la app otra vez)
//! relanza el ejecutable; el plugin lo detecta y en vez de abrir una segunda
//! ventana enfoca la que ya está abierta.

mod db_tx;

#[cfg(desktop)]
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();
    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.unminimize();
            let _ = window.show();
            let _ = window.set_focus();
        }
    }));
    builder
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![db_tx::db_transaction])
        .run(tauri::generate_context!())
        .expect("error al arrancar Fintrack");
}
