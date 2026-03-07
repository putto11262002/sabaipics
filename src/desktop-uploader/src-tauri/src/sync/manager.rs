use super::db::{DbHandle, JobStats, SyncRow, now_ms};
use super::engine::Engine;
use super::upload::{UploadSignal, UploadWorker};
use crate::api::ApiClient;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::Emitter;
use tokio::sync::Mutex;

// ── Types for frontend ──────────────────────────────────────────────────

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncInfo {
    pub id: String,
    pub event_id: String,
    pub folder_path: String,
    pub running: bool,
    pub paused: bool,
    pub active: bool,
    pub stats: JobStats,
}

// ── Manager ─────────────────────────────────────────────────────────────

pub struct SyncManager {
    db: DbHandle,
    api: Arc<dyn ApiClient>,
    engines: Arc<Mutex<HashMap<String, Engine>>>,
    upload_worker: Mutex<Option<UploadWorker>>,
}

impl SyncManager {
    pub fn new(db: DbHandle, api: Arc<dyn ApiClient>) -> Self {
        Self {
            db,
            api,
            engines: Arc::new(Mutex::new(HashMap::new())),
            upload_worker: Mutex::new(None),
        }
    }

    pub fn db(&self) -> &DbHandle {
        &self.db
    }

    /// Ensure the upload worker is running. Called lazily on first engine start.
    async fn ensure_upload_worker(&self, app_handle: &tauri::AppHandle) {
        let mut worker = self.upload_worker.lock().await;
        if worker.is_none() {
            let (signal_tx, signal_rx) = tokio::sync::mpsc::unbounded_channel();
            *worker = Some(UploadWorker::spawn(
                self.db.clone(),
                self.api.clone(),
                signal_tx,
            ));

            // Spawn signal listener
            let db = self.db.clone();
            let engines = self.engines.clone();
            let app = app_handle.clone();
            tokio::spawn(async move {
                Self::signal_listener(signal_rx, db, engines, app).await;
            });
        }
    }

    /// Process signals from the upload worker.
    async fn signal_listener(
        mut rx: tokio::sync::mpsc::UnboundedReceiver<UploadSignal>,
        db: DbHandle,
        engines: Arc<Mutex<HashMap<String, Engine>>>,
        app: tauri::AppHandle,
    ) {
        while let Some(signal) = rx.recv().await {
            match signal {
                UploadSignal::PaymentRequired => {
                    log::warn!("[manager] payment required — pausing all engines");
                    // Pause all running engines
                    let guard = engines.lock().await;
                    for engine in guard.values() {
                        engine.pause();
                    }
                    // Notify frontend
                    let _ = app.emit("sync://payment-required", ());
                }
                UploadSignal::EventTerminal { event_id, reason } => {
                    log::warn!("[manager] event {event_id} is terminal: {reason}");
                    // Stop engines for this event
                    let syncs = db.sync_list().await.unwrap_or_default();
                    let mut guard = engines.lock().await;
                    for row in &syncs {
                        if row.event_id == event_id {
                            if let Some(engine) = guard.remove(&row.id) {
                                engine.stop();
                            }
                            let _ = db.sync_set_active(row.id.clone(), false).await;
                        }
                    }
                    drop(guard);
                    // Fail all remaining jobs for this event
                    let _ = db.fail_event_jobs(event_id.clone(), reason.clone()).await;
                    // Notify frontend
                    let _ = app.emit(
                        "sync://event-terminal",
                        serde_json::json!({ "eventId": event_id, "reason": reason }),
                    );
                }
            }
        }
    }

    /// Create a new sync mapping, persist it, and auto-start the engine.
    pub async fn add_sync(
        &self,
        event_id: String,
        folder_path: String,
        app_handle: tauri::AppHandle,
    ) -> Result<SyncRow, String> {
        let path = PathBuf::from(&folder_path);
        if !path.is_dir() {
            return Err(format!("folder does not exist: {folder_path}"));
        }

        let now = now_ms();
        let row = SyncRow {
            id: uuid::Uuid::new_v4().to_string(),
            event_id,
            folder_path,
            include_subfolders: true,
            paused: false,
            active: true,
            created_at: now,
            updated_at: now,
        };

        self.db.sync_insert(row.clone()).await?;

        // Auto-start the engine
        self.start_engine_inner(&row, app_handle).await?;

        Ok(row)
    }

    /// Remove a sync and stop its engine if running.
    pub async fn remove_sync(&self, sync_id: &str) -> Result<(), String> {
        self.stop_engine(sync_id).await;
        self.db.sync_delete(sync_id.to_string()).await
    }

    /// List all syncs with their running status and stats.
    pub async fn list_syncs(&self) -> Result<Vec<SyncInfo>, String> {
        let rows = self.db.sync_list().await?;
        let engines = self.engines.lock().await;

        let mut result = Vec::with_capacity(rows.len());
        for row in rows {
            let stats = self.db.job_stats(row.id.clone()).await.unwrap_or(JobStats {
                pending: 0,
                stabilizing: 0,
                ready: 0,
                uploading: 0,
                done: 0,
                failed: 0,
            });

            let (running, paused) = match engines.get(&row.id) {
                Some(e) => (true, e.is_paused()),
                None => (false, false),
            };

            result.push(SyncInfo {
                id: row.id,
                event_id: row.event_id,
                folder_path: row.folder_path,
                running,
                paused,
                active: row.active,
                stats,
            });
        }

        Ok(result)
    }

    /// Start the engine for a sync. Sets active=true in DB.
    pub async fn start_engine(
        &self,
        sync_id: &str,
        app_handle: tauri::AppHandle,
    ) -> Result<(), String> {
        let row = self
            .db
            .sync_get(sync_id.to_string())
            .await?
            .ok_or_else(|| format!("sync not found: {sync_id}"))?;

        self.db.sync_set_active(sync_id.to_string(), true).await?;
        self.start_engine_inner(&row, app_handle).await
    }

    /// Stop the engine for a sync. Sets active=false in DB.
    pub async fn stop_engine(&self, sync_id: &str) {
        let _ = self.db.sync_set_active(sync_id.to_string(), false).await;
        let mut engines = self.engines.lock().await;
        if let Some(engine) = engines.remove(sync_id) {
            engine.stop();
        }
    }

    /// Auto-start all syncs that were active when the app last closed.
    pub async fn auto_start_active(&self, app_handle: tauri::AppHandle) {
        let rows = match self.db.sync_list().await {
            Ok(rows) => rows,
            Err(e) => {
                log::error!("[sync] failed to list syncs for auto-start: {e}");
                return;
            }
        };

        for row in rows {
            if row.active {
                if let Err(e) = self.start_engine_inner(&row, app_handle.clone()).await {
                    log::error!("[sync] failed to auto-start {}: {e}", row.id);
                }
            }
        }
    }

    /// Resume all paused engines (after user buys credits).
    pub async fn resume_all(&self) {
        let guard = self.engines.lock().await;
        for engine in guard.values() {
            engine.resume();
        }
    }

    /// Retry a single failed job.
    pub async fn retry_job(&self, job_id: &str) -> Result<(), String> {
        self.db.retry_job(job_id.to_string()).await
    }

    /// Retry all failed jobs for an event.
    pub async fn retry_event_failed(&self, event_id: &str) -> Result<u64, String> {
        self.db.retry_event_failed(event_id.to_string()).await
    }

    pub async fn get_stats(&self, sync_id: &str) -> Result<JobStats, String> {
        self.db.job_stats(sync_id.to_string()).await
    }

    // ── Internal ─────────────────────────────────────────────────────────

    async fn start_engine_inner(
        &self,
        row: &SyncRow,
        app_handle: tauri::AppHandle,
    ) -> Result<(), String> {
        self.ensure_upload_worker(&app_handle).await;
        let mut engines = self.engines.lock().await;
        if engines.contains_key(&row.id) {
            return Ok(());
        }

        let engine = Engine::spawn(
            self.db.clone(),
            app_handle,
            row.id.clone(),
            PathBuf::from(&row.folder_path),
            row.include_subfolders,
        );

        engines.insert(row.id.clone(), engine);
        Ok(())
    }
}
