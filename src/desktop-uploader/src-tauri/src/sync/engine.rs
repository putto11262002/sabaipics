use super::db::{DbHandle, JobStats};
use super::{scan, watcher};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::Emitter;
use tokio::task::JoinHandle;
use tokio_util::sync::CancellationToken;

const STABILIZE_BATCH: u32 = 200;
const STABILIZE_TICKS: i64 = 3;
const TICK_MS: u64 = 700;
const SAFETY_SCAN_SECS: u64 = 10 * 60;

const EVENT_STATS: &str = "sync://stats";

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct StatsEvent {
    sync_id: String,
    stats: JobStats,
}

// ── Engine ──────────────────────────────────────────────────────────────

/// Per-sync processor. Handles scan, stabilize, retry, and stats emission.
/// Does NOT upload — that's the UploadWorker's job.
pub struct Engine {
    cancel: CancellationToken,
    paused: Arc<AtomicBool>,
    processor_task: JoinHandle<()>,
    watcher_task: JoinHandle<()>,
}

impl Engine {
    pub fn spawn(
        db: DbHandle,
        app_handle: tauri::AppHandle,
        sync_id: String,
        folder_path: PathBuf,
        recursive: bool,
    ) -> Self {
        let cancel = CancellationToken::new();
        let paused = Arc::new(AtomicBool::new(false));

        let watcher_task = tokio::spawn(watcher::run(
            db.clone(),
            sync_id.clone(),
            folder_path.clone(),
            recursive,
            cancel.clone(),
            paused.clone(),
        ));

        let processor_task = {
            let db = db.clone();
            let cancel = cancel.clone();
            let paused = paused.clone();
            let sync_id = sync_id.clone();

            tokio::spawn(async move {
                processor_loop(db, app_handle, sync_id, folder_path, recursive, cancel, paused).await;
            })
        };

        Self {
            cancel,
            paused,
            processor_task,
            watcher_task,
        }
    }

    pub fn pause(&self) {
        self.paused.store(true, Ordering::Relaxed);
    }

    pub fn resume(&self) {
        self.paused.store(false, Ordering::Relaxed);
    }

    pub fn is_paused(&self) -> bool {
        self.paused.load(Ordering::Relaxed)
    }

    pub fn stop(self) {
        self.cancel.cancel();
        self.processor_task.abort();
        self.watcher_task.abort();
    }
}

async fn processor_loop(
    db: DbHandle,
    app_handle: tauri::AppHandle,
    sync_id: String,
    folder_path: PathBuf,
    recursive: bool,
    cancel: CancellationToken,
    paused: Arc<AtomicBool>,
) {
    // Initial scan
    if let Err(e) = scan::scan(&db, &sync_id, &folder_path, recursive).await {
        log::warn!("[engine] sync={sync_id} initial scan failed: {e}");
    }

    let mut last_stats: Option<JobStats> = None;
    let mut last_safety_scan = tokio::time::Instant::now();

    loop {
        if cancel.is_cancelled() {
            break;
        }

        if paused.load(Ordering::Relaxed) {
            tokio::time::sleep(std::time::Duration::from_millis(500)).await;
            continue;
        }

        // Periodic safety scan (backstop for missed FS events)
        if last_safety_scan.elapsed() >= std::time::Duration::from_secs(SAFETY_SCAN_SECS) {
            if let Err(e) = scan::scan(&db, &sync_id, &folder_path, recursive).await {
                log::warn!("[engine] sync={sync_id} safety scan failed: {e}");
            }
            last_safety_scan = tokio::time::Instant::now();
        }

        // Stabilize: pending/stabilizing -> ready
        if let Err(e) = db.stabilize_tick(sync_id.clone(), STABILIZE_BATCH, STABILIZE_TICKS).await {
            log::warn!("[engine] sync={sync_id} stabilize failed: {e}");
        }

        // Auto-retry backoff-eligible failures
        if let Ok(n) = db.auto_requeue_retryable(sync_id.clone()).await {
            if n > 0 {
                log::info!("[engine] sync={sync_id} requeued {n} retryable jobs");
            }
        }

        // Emit stats if changed
        if let Ok(stats) = db.job_stats(sync_id.clone()).await {
            let changed = last_stats.as_ref() != Some(&stats);
            if changed {
                last_stats = Some(stats.clone());
                let _ = app_handle.emit(
                    EVENT_STATS,
                    StatsEvent {
                        sync_id: sync_id.clone(),
                        stats,
                    },
                );
            }
        }

        tokio::time::sleep(std::time::Duration::from_millis(TICK_MS)).await;
    }

    log::info!("[engine] sync={sync_id} stopped");
}
