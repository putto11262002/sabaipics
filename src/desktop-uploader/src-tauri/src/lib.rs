mod api;
mod http_client;
mod sync;
mod token_manager;

use std::sync::Arc;
use sync::SyncManager;
use tauri::Manager;
use token_manager::{AuthStatus, TokenManager, UserInfo};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[allow(unused_mut)]
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_oauth::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            // Auth
            init_token_manager,
            set_auth_tokens,
            get_access_token,
            get_auth_status,
            sign_out,
            // Sync
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

            // Initialize DB actor thread
            let mut db_path = app
                .handle()
                .path()
                .app_config_dir()
                .expect("app config dir");
            std::fs::create_dir_all(&db_path).expect("create config dir");
            db_path.push("sync.db");

            let db = sync::db::DbHandle::spawn(&db_path).expect("start db actor");

            // Token manager (owns refresh logic, shared with HttpApiClient)
            let token_mgr = Arc::new(TokenManager::new(db.clone()));

            // Real HTTP upload client
            let api_client = Arc::new(http_client::HttpApiClient::new(token_mgr.clone()));

            // Sync manager (owns engines + upload worker)
            let manager = SyncManager::new(db, api_client);

            app.handle().manage(token_mgr);
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

/// Called once on app start. Sets API base URL and restores session.
#[tauri::command]
async fn init_token_manager(
    tm: tauri::State<'_, Arc<TokenManager>>,
    base_url: String,
) -> Result<AuthStatus, String> {
    Ok(tm.init(base_url).await)
}

/// Called after OAuth redeem to store all tokens.
#[tauri::command]
async fn set_auth_tokens(
    tm: tauri::State<'_, Arc<TokenManager>>,
    access_token: String,
    expires_at: i64,
    refresh_token: String,
    user_name: Option<String>,
    user_email: Option<String>,
) -> Result<(), String> {
    let user = if user_name.is_some() || user_email.is_some() {
        Some(UserInfo {
            name: user_name,
            email: user_email,
        })
    } else {
        None
    };
    tm.set_tokens(access_token, expires_at, refresh_token, user)
        .await;
    Ok(())
}

/// Get a valid access token (auto-refreshes if expired).
#[tauri::command]
async fn get_access_token(
    tm: tauri::State<'_, Arc<TokenManager>>,
) -> Result<String, String> {
    tm.get_token().await.map_err(|e| e.to_string())
}

/// Check current auth status.
#[tauri::command]
async fn get_auth_status(
    tm: tauri::State<'_, Arc<TokenManager>>,
) -> Result<AuthStatus, String> {
    Ok(tm.auth_status().await)
}

/// Sign out — clear all tokens.
#[tauri::command]
async fn sign_out(
    tm: tauri::State<'_, Arc<TokenManager>>,
) -> Result<(), String> {
    tm.clear().await;
    Ok(())
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
