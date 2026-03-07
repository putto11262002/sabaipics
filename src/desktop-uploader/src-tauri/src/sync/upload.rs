use super::db::{DbHandle, JobLease};
use super::retry;
use crate::api::{ApiClient, ApiError};
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::mpsc;
use tokio::task::JoinHandle;
use tokio_util::sync::CancellationToken;

const POLL_MS: u64 = 500;
const UPLOAD_CONCURRENCY: usize = 4;

/// Signals the upload worker sends back to the manager.
#[derive(Debug)]
pub enum UploadSignal {
    /// 402 — pause everything, surface "no credits" to user.
    PaymentRequired,
    /// 404/410 — event is gone, stop its syncs.
    EventTerminal { event_id: String, reason: String },
}

/// Shared upload worker. Polls the DB for ready jobs across all syncs
/// and uploads with bounded global concurrency.
pub struct UploadWorker {
    cancel: CancellationToken,
    task: JoinHandle<()>,
}

impl UploadWorker {
    pub fn spawn(
        db: DbHandle,
        api: Arc<dyn ApiClient>,
        signal_tx: mpsc::UnboundedSender<UploadSignal>,
    ) -> Self {
        let cancel = CancellationToken::new();

        let task = {
            let cancel = cancel.clone();
            tokio::spawn(async move {
                upload_loop(db, api, cancel, signal_tx).await;
            })
        };

        Self { cancel, task }
    }

    pub fn stop(self) {
        self.cancel.cancel();
        self.task.abort();
    }
}

async fn upload_loop(
    db: DbHandle,
    api: Arc<dyn ApiClient>,
    cancel: CancellationToken,
    signal_tx: mpsc::UnboundedSender<UploadSignal>,
) {
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
            let sig_tx = signal_tx.clone();

            tokio::spawn(async move {
                let _permit = permit;
                upload_one(&db, &api, job, &sig_tx).await;
            });
        }
    }

    log::info!("[upload-worker] stopped");
}

async fn upload_one(
    db: &DbHandle,
    api: &Arc<dyn ApiClient>,
    job: JobLease,
    signal_tx: &mpsc::UnboundedSender<UploadSignal>,
) {
    let path = PathBuf::from(&job.path);
    let file_name = path
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();

    // Check file exists before attempting upload
    if !path.exists() {
        log::warn!("[upload] file missing: {file_name} (job={})", job.id);
        let _ = db
            .mark_job_failed(
                job.id,
                "File no longer exists".to_string(),
                None,
                Some("file_error".to_string()),
                false,
                None,
            )
            .await;
        return;
    }

    match api.upload_photo(&job.event_id, &path).await {
        Ok(()) => {
            log::info!("[upload] done: {file_name} (job={})", job.id);
            if let Err(e) = db.mark_job_done(job.id).await {
                log::error!("[upload] mark done failed: {e}");
            }
        }
        Err(ref e) => {
            log::warn!("[upload] failed: {file_name} (job={}): {e}", job.id);
            let decision = retry::from_api_error(job.attempt_count, e);

            // Signal manager for actionable errors
            if let ApiError::Http { code, .. } = e {
                if code.is_terminal_for_event() {
                    log::error!(
                        "[upload] event {} is terminal ({code}), job {} will not retry",
                        job.event_id,
                        job.id
                    );
                    let _ = signal_tx.send(UploadSignal::EventTerminal {
                        event_id: job.event_id.clone(),
                        reason: format!("Event is {code}"),
                    });
                }
                if code.is_user_retryable() {
                    log::warn!(
                        "[upload] job {} requires user action ({code})",
                        job.id
                    );
                    let _ = signal_tx.send(UploadSignal::PaymentRequired);
                }
            }

            if let Err(e2) = db
                .mark_job_failed(
                    job.id,
                    e.to_string(),
                    e.http_status().map(|s| s as i64),
                    decision.error_code,
                    decision.retryable,
                    decision.next_retry_at,
                )
                .await
            {
                log::error!("[upload] mark failed error: {e2}");
            }
        }
    }
}
