mod api;
mod sync;

use std::sync::Arc;
use sync::SyncManager;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let api_client = Arc::new(api::MockApiClient);

    #[allow(unused_mut)]
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_oauth::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            set_auth_token,
            get_auth_token,
            clear_auth_token,
            add_sync,
            remove_sync,
            list_syncs,
            start_sync,
            stop_sync,
            get_sync_stats,
            get_dir_size,
            retry_job,
            retry_event_failed,
            resume_all_syncs,
        ]);

    #[cfg(feature = "debug-mcp")]
    {
        builder = builder.plugin(tauri_plugin_mcp::init_with_config(
            tauri_plugin_mcp::PluginConfig::new("FrameFast".to_string())
                .start_socket_server(true)
                .socket_path("/tmp/tauri-mcp.sock".into()),
        ));
    }

    builder
        .setup(move |app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // Initialize DB actor thread and sync manager
            let mut db_path = app
                .handle()
                .path()
                .app_config_dir()
                .expect("app config dir");
            std::fs::create_dir_all(&db_path).expect("create config dir");
            db_path.push("sync.db");

            let db = sync::db::DbHandle::spawn(&db_path).expect("start db actor");
            let manager = SyncManager::new(db, api_client);
            app.handle().manage(manager);

            // Auto-start syncs that were active when the app last closed
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let mgr = handle.state::<SyncManager>();
                mgr.auto_start_active(handle.clone()).await;
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

// ── Auth commands ──────────────────────────────────────────────────────

const AUTH_TOKEN_KEY: &str = "refresh_token";

#[tauri::command]
async fn set_auth_token(
    state: tauri::State<'_, SyncManager>,
    token: String,
) -> Result<(), String> {
    state.db().kv_set(AUTH_TOKEN_KEY.to_string(), token).await
}

#[tauri::command]
async fn get_auth_token(
    state: tauri::State<'_, SyncManager>,
) -> Result<Option<String>, String> {
    state.db().kv_get(AUTH_TOKEN_KEY.to_string()).await
}

#[tauri::command]
async fn clear_auth_token(
    state: tauri::State<'_, SyncManager>,
) -> Result<(), String> {
    state.db().kv_delete(AUTH_TOKEN_KEY.to_string()).await
}

// ── Sync commands ──────────────────────────────────────────────────────

#[tauri::command]
async fn add_sync(
    state: tauri::State<'_, SyncManager>,
    app_handle: tauri::AppHandle,
    event_id: String,
    folder_path: String,
) -> Result<sync::db::SyncRow, String> {
    state.add_sync(event_id, folder_path, app_handle).await
}

#[tauri::command]
async fn remove_sync(
    state: tauri::State<'_, SyncManager>,
    sync_id: String,
) -> Result<(), String> {
    state.remove_sync(&sync_id).await
}

#[tauri::command]
async fn list_syncs(
    state: tauri::State<'_, SyncManager>,
) -> Result<Vec<sync::SyncInfo>, String> {
    state.list_syncs().await
}

#[tauri::command]
async fn start_sync(
    state: tauri::State<'_, SyncManager>,
    app_handle: tauri::AppHandle,
    sync_id: String,
) -> Result<(), String> {
    state.start_engine(&sync_id, app_handle).await
}

#[tauri::command]
async fn stop_sync(
    state: tauri::State<'_, SyncManager>,
    sync_id: String,
) -> Result<(), String> {
    state.stop_engine(&sync_id).await;
    Ok(())
}

#[tauri::command]
async fn get_sync_stats(
    state: tauri::State<'_, SyncManager>,
    sync_id: String,
) -> Result<sync::db::JobStats, String> {
    state.get_stats(&sync_id).await
}

#[tauri::command]
async fn retry_job(
    state: tauri::State<'_, SyncManager>,
    job_id: String,
) -> Result<(), String> {
    state.retry_job(&job_id).await
}

#[tauri::command]
async fn retry_event_failed(
    state: tauri::State<'_, SyncManager>,
    event_id: String,
) -> Result<u64, String> {
    state.retry_event_failed(&event_id).await
}

#[tauri::command]
async fn resume_all_syncs(
    state: tauri::State<'_, SyncManager>,
) -> Result<(), String> {
    state.resume_all().await;
    Ok(())
}

#[tauri::command]
async fn get_dir_size(folder_path: String) -> Result<u64, String> {
    tokio::task::spawn_blocking(move || {
        let mut total: u64 = 0;
        for entry in walkdir::WalkDir::new(&folder_path)
            .into_iter()
            .filter_map(|e| e.ok())
        {
            if entry.file_type().is_file() {
                if let Ok(meta) = entry.metadata() {
                    total += meta.len();
                }
            }
        }
        Ok(total)
    })
    .await
    .map_err(|e| e.to_string())?
}
