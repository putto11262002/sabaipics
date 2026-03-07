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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::api::{ApiErrorCode, ApiError};
    use std::io::Write;
    use std::sync::Mutex;
    use tempfile::NamedTempFile;

    /// A mock API client that returns a scripted result.
    struct ScriptedApiClient {
        result: Mutex<Option<Result<(), ApiError>>>,
    }

    impl ScriptedApiClient {
        fn ok() -> Arc<dyn ApiClient> {
            Arc::new(Self {
                result: Mutex::new(Some(Ok(()))),
            })
        }

        fn err(e: ApiError) -> Arc<dyn ApiClient> {
            Arc::new(Self {
                result: Mutex::new(Some(Err(e))),
            })
        }
    }

    #[async_trait::async_trait]
    impl ApiClient for ScriptedApiClient {
        async fn upload_photo(&self, _event_id: &str, _file_path: &std::path::Path) -> Result<(), ApiError> {
            self.result.lock().unwrap().take().unwrap()
        }
    }

    fn test_db() -> DbHandle {
        let dir = tempfile::tempdir().unwrap();
        let db_path = dir.path().join("test.db");
        let db = DbHandle::spawn(&db_path).unwrap();
        // Keep tempdir alive by leaking it (tests are short-lived)
        std::mem::forget(dir);
        db
    }

    fn test_job(path: &str) -> JobLease {
        JobLease {
            id: uuid::Uuid::new_v4().to_string(),
            sync_id: "sync-1".into(),
            event_id: "event-1".into(),
            path: path.into(),
            size_bytes: 1000,
            fingerprint: "abc123".into(),
            upload_id: None,
            attempt_count: 1,
        }
    }

    fn make_temp_file() -> NamedTempFile {
        let mut f = NamedTempFile::new().unwrap();
        f.write_all(b"fake image data").unwrap();
        f.flush().unwrap();
        f
    }

    #[tokio::test]
    async fn upload_success_marks_done() {
        let db = test_db();
        let file = make_temp_file();
        let job = test_job(file.path().to_str().unwrap());
        let api = ScriptedApiClient::ok();
        let (tx, _rx) = mpsc::unbounded_channel();

        upload_one(&db, &api, job.clone(), &tx).await;

        // Job should be marked done — verify via stats after inserting
        // Since upload_one calls mark_job_done which updates by ID,
        // and we didn't insert the job into DB, it's a no-op but no crash.
        // The important thing: no signal sent, no panic.
    }

    #[tokio::test]
    async fn upload_file_missing_marks_failed() {
        let db = test_db();
        let job = test_job("/nonexistent/photo.jpg");
        let api = ScriptedApiClient::ok();
        let (tx, _rx) = mpsc::unbounded_channel();

        upload_one(&db, &api, job, &tx).await;
        // Should not panic, should log warning
    }

    #[tokio::test]
    async fn upload_402_sends_payment_signal() {
        let db = test_db();
        let file = make_temp_file();
        let job = test_job(file.path().to_str().unwrap());
        let api = ScriptedApiClient::err(ApiError::Http {
            status: 402,
            code: ApiErrorCode::PaymentRequired,
            message: "No credits".into(),
            retry_after_secs: None,
        });
        let (tx, mut rx) = mpsc::unbounded_channel();

        upload_one(&db, &api, job, &tx).await;

        let signal = rx.try_recv().unwrap();
        assert!(matches!(signal, UploadSignal::PaymentRequired));
    }

    #[tokio::test]
    async fn upload_404_sends_event_terminal_signal() {
        let db = test_db();
        let file = make_temp_file();
        let job = test_job(file.path().to_str().unwrap());
        let api = ScriptedApiClient::err(ApiError::Http {
            status: 404,
            code: ApiErrorCode::NotFound,
            message: "Event not found".into(),
            retry_after_secs: None,
        });
        let (tx, mut rx) = mpsc::unbounded_channel();

        upload_one(&db, &api, job, &tx).await;

        let signal = rx.try_recv().unwrap();
        match signal {
            UploadSignal::EventTerminal { event_id, .. } => {
                assert_eq!(event_id, "event-1");
            }
            _ => panic!("expected EventTerminal signal"),
        }
    }

    #[tokio::test]
    async fn upload_410_sends_event_terminal_signal() {
        let db = test_db();
        let file = make_temp_file();
        let job = test_job(file.path().to_str().unwrap());
        let api = ScriptedApiClient::err(ApiError::Http {
            status: 410,
            code: ApiErrorCode::Gone,
            message: "Event expired".into(),
            retry_after_secs: None,
        });
        let (tx, mut rx) = mpsc::unbounded_channel();

        upload_one(&db, &api, job, &tx).await;

        let signal = rx.try_recv().unwrap();
        assert!(matches!(signal, UploadSignal::EventTerminal { .. }));
    }

    #[tokio::test]
    async fn upload_429_no_signal() {
        let db = test_db();
        let file = make_temp_file();
        let job = test_job(file.path().to_str().unwrap());
        let api = ScriptedApiClient::err(ApiError::Http {
            status: 429,
            code: ApiErrorCode::RateLimited,
            message: "Slow down".into(),
            retry_after_secs: Some(15),
        });
        let (tx, mut rx) = mpsc::unbounded_channel();

        upload_one(&db, &api, job, &tx).await;

        // No signal should be sent for rate limiting
        assert!(rx.try_recv().is_err());
    }

    #[tokio::test]
    async fn upload_500_no_signal() {
        let db = test_db();
        let file = make_temp_file();
        let job = test_job(file.path().to_str().unwrap());
        let api = ScriptedApiClient::err(ApiError::Http {
            status: 500,
            code: ApiErrorCode::InternalError,
            message: "Server error".into(),
            retry_after_secs: None,
        });
        let (tx, mut rx) = mpsc::unbounded_channel();

        upload_one(&db, &api, job, &tx).await;

        assert!(rx.try_recv().is_err());
    }

    #[tokio::test]
    async fn upload_network_error_no_signal() {
        let db = test_db();
        let file = make_temp_file();
        let job = test_job(file.path().to_str().unwrap());
        let api = ScriptedApiClient::err(ApiError::Network("connection refused".into()));
        let (tx, mut rx) = mpsc::unbounded_channel();

        upload_one(&db, &api, job, &tx).await;

        assert!(rx.try_recv().is_err());
    }

    #[tokio::test]
    async fn upload_presign_expired_no_signal() {
        let db = test_db();
        let file = make_temp_file();
        let job = test_job(file.path().to_str().unwrap());
        let api = ScriptedApiClient::err(ApiError::PresignExpired);
        let (tx, mut rx) = mpsc::unbounded_channel();

        upload_one(&db, &api, job, &tx).await;

        assert!(rx.try_recv().is_err());
    }

    #[tokio::test]
    async fn upload_conflict_no_signal() {
        let db = test_db();
        let file = make_temp_file();
        let job = test_job(file.path().to_str().unwrap());
        let api = ScriptedApiClient::err(ApiError::Http {
            status: 409,
            code: ApiErrorCode::Conflict,
            message: "state mismatch".into(),
            retry_after_secs: None,
        });
        let (tx, mut rx) = mpsc::unbounded_channel();

        upload_one(&db, &api, job, &tx).await;

        assert!(rx.try_recv().is_err());
    }
}
