use super::db::{DbHandle, JobLease};
use crate::api::ApiClient;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::task::JoinHandle;
use tokio_util::sync::CancellationToken;

const POLL_MS: u64 = 500;
const UPLOAD_CONCURRENCY: usize = 4;

/// Shared upload worker. Polls the DB for ready jobs across all syncs
/// and uploads with bounded global concurrency.
pub struct UploadWorker {
    cancel: CancellationToken,
    task: JoinHandle<()>,
}

impl UploadWorker {
    pub fn spawn(db: DbHandle, api: Arc<dyn ApiClient>) -> Self {
        let cancel = CancellationToken::new();

        let task = {
            let cancel = cancel.clone();
            tokio::spawn(async move {
                upload_loop(db, api, cancel).await;
            })
        };

        Self { cancel, task }
    }

    pub fn stop(self) {
        self.cancel.cancel();
        self.task.abort();
    }
}

async fn upload_loop(db: DbHandle, api: Arc<dyn ApiClient>, cancel: CancellationToken) {
    let sem = Arc::new(tokio::sync::Semaphore::new(UPLOAD_CONCURRENCY));

    loop {
        if cancel.is_cancelled() {
            break;
        }

        // Lease as many jobs as we have available permits
        let available = sem.available_permits() as u32;
        if available == 0 {
            tokio::time::sleep(std::time::Duration::from_millis(POLL_MS)).await;
            continue;
        }

        let leased = match db.lease_ready_jobs_global(available).await {
            Ok(jobs) => jobs,
            Err(e) => {
                log::warn!("[upload-worker] lease failed: {e}");
                tokio::time::sleep(std::time::Duration::from_millis(POLL_MS)).await;
                continue;
            }
        };

        if leased.is_empty() {
            tokio::time::sleep(std::time::Duration::from_millis(POLL_MS)).await;
            continue;
        }

        log::info!("[upload-worker] leased {} jobs", leased.len());

        for job in leased {
            let permit = match sem.clone().acquire_owned().await {
                Ok(p) => p,
                Err(_) => break,
            };
            let api = api.clone();
            let db = db.clone();

            tokio::spawn(async move {
                let _permit = permit;
                upload_one(&db, &api, job).await;
            });
        }
    }

    log::info!("[upload-worker] stopped");
}

async fn upload_one(db: &DbHandle, api: &Arc<dyn ApiClient>, job: JobLease) {
    let path = PathBuf::from(&job.path);
    let file_name = path
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();

    match api.upload_photo(&job.event_id, &path).await {
        Ok(()) => {
            log::info!("[upload] done: {file_name} (job={})", job.id);
            if let Err(e) = db.mark_job_done(job.id).await {
                log::error!("[upload] mark done failed: {e}");
            }
        }
        Err(e) => {
            log::warn!("[upload] failed: {file_name} (job={}): {e}", job.id);
            // When real API is wired, use retry::from_http_status here
            if let Err(e2) = db
                .mark_job_failed(job.id, e.to_string(), None, None, true, None)
                .await
            {
                log::error!("[upload] mark failed error: {e2}");
            }
        }
    }
}
