use rusqlite::{params, Connection, OptionalExtension};
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

pub fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

// ── Types ───────────────────────────────────────────────────────────────

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncRow {
    pub id: String,
    pub event_id: String,
    pub folder_path: String,
    pub include_subfolders: bool,
    pub paused: bool,
    pub active: bool,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, serde::Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct JobStats {
    pub pending: i64,
    pub stabilizing: i64,
    pub ready: i64,
    pub uploading: i64,
    pub done: i64,
    pub failed: i64,
}

#[derive(Debug, Clone)]
pub struct JobLease {
    pub id: String,
    pub sync_id: String,
    pub event_id: String,
    pub path: String,
    pub size_bytes: i64,
    pub fingerprint: String,
    pub upload_id: Option<String>,
    pub attempt_count: i64,
}

// ── DbHandle (async-safe, clone-able) ───────────────────────────────────

type DbCommand = Box<dyn FnOnce(&Connection) + Send>;

/// Async-friendly handle to the database actor thread.
/// All methods send a closure to the dedicated DB thread and await the result
/// via a oneshot channel. No blocking on the tokio runtime.
#[derive(Clone)]
pub struct DbHandle {
    tx: std::sync::mpsc::Sender<DbCommand>,
}

impl DbHandle {
    /// Spawn the DB actor thread. Returns a cloneable handle.
    pub fn spawn(db_path: &Path) -> Result<Self, String> {
        if let Some(parent) = db_path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("create db dir: {e}"))?;
        }

        let conn = Connection::open(db_path).map_err(|e| format!("open db: {e}"))?;
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;")
            .map_err(|e| format!("pragma: {e}"))?;

        // Run migrations inline before handing off to the thread
        conn.execute_batch(include_str!("../../migrations/0001_init.sql"))
            .map_err(|e| format!("migration 0001: {e}"))?;
        conn.execute_batch(include_str!("../../migrations/0002_add_active.sql"))
            .map_err(|e| format!("migration 0002: {e}"))?;

        let (tx, rx) = std::sync::mpsc::channel::<DbCommand>();

        std::thread::Builder::new()
            .name("db-actor".into())
            .spawn(move || {
                while let Ok(cmd) = rx.recv() {
                    cmd(&conn);
                }
                log::info!("[db] actor thread stopped");
            })
            .map_err(|e| format!("spawn db thread: {e}"))?;

        Ok(Self { tx })
    }

    /// Send a command to the DB thread and await the result.
    async fn exec<T, F>(&self, f: F) -> Result<T, String>
    where
        T: Send + 'static,
        F: FnOnce(&Connection) -> Result<T, String> + Send + 'static,
    {
        let (resp_tx, resp_rx) = tokio::sync::oneshot::channel();
        self.tx
            .send(Box::new(move |conn| {
                let result = f(conn);
                let _ = resp_tx.send(result);
            }))
            .map_err(|_| "db actor closed".to_string())?;
        resp_rx.await.map_err(|_| "db response dropped".to_string())?
    }

    // ── Sync CRUD ───────────────────────────────────────────────────────

    pub async fn sync_list(&self) -> Result<Vec<SyncRow>, String> {
        self.exec(|conn| {
            let mut stmt = conn
                .prepare(
                    "SELECT id, event_id, folder_path, include_subfolders, paused, active, created_at, updated_at
                     FROM sync ORDER BY created_at DESC",
                )
                .map_err(|e| e.to_string())?;

            let rows = stmt.query_map([], |row| {
                Ok(SyncRow {
                    id: row.get(0)?,
                    event_id: row.get(1)?,
                    folder_path: row.get(2)?,
                    include_subfolders: row.get::<_, i64>(3)? != 0,
                    paused: row.get::<_, i64>(4)? != 0,
                    active: row.get::<_, i64>(5)? != 0,
                    created_at: row.get(6)?,
                    updated_at: row.get(7)?,
                })
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
            Ok(rows)
        })
        .await
    }

    pub async fn sync_get(&self, sync_id: String) -> Result<Option<SyncRow>, String> {
        self.exec(move |conn| {
            conn.query_row(
                "SELECT id, event_id, folder_path, include_subfolders, paused, active, created_at, updated_at
                 FROM sync WHERE id = ?1",
                [&sync_id],
                |row| {
                    Ok(SyncRow {
                        id: row.get(0)?,
                        event_id: row.get(1)?,
                        folder_path: row.get(2)?,
                        include_subfolders: row.get::<_, i64>(3)? != 0,
                        paused: row.get::<_, i64>(4)? != 0,
                        active: row.get::<_, i64>(5)? != 0,
                        created_at: row.get(6)?,
                        updated_at: row.get(7)?,
                    })
                },
            )
            .optional()
            .map_err(|e| e.to_string())
        })
        .await
    }

    pub async fn sync_insert(&self, row: SyncRow) -> Result<(), String> {
        self.exec(move |conn| {
            conn.execute(
                "INSERT INTO sync (id, event_id, folder_path, include_subfolders, paused, active, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                params![
                    row.id,
                    row.event_id,
                    row.folder_path,
                    if row.include_subfolders { 1 } else { 0 },
                    if row.paused { 1 } else { 0 },
                    if row.active { 1 } else { 0 },
                    row.created_at,
                    row.updated_at,
                ],
            )
            .map_err(|e| e.to_string())?;
            Ok(())
        })
        .await
    }

    pub async fn sync_set_active(&self, sync_id: String, active: bool) -> Result<(), String> {
        self.exec(move |conn| {
            conn.execute(
                "UPDATE sync SET active = ?2, updated_at = ?3 WHERE id = ?1",
                params![sync_id, if active { 1 } else { 0 }, now_ms()],
            )
            .map_err(|e| e.to_string())?;
            Ok(())
        })
        .await
    }

    pub async fn sync_delete(&self, sync_id: String) -> Result<(), String> {
        self.exec(move |conn| {
            conn.execute("DELETE FROM upload_jobs WHERE sync_id = ?1", [&sync_id])
                .map_err(|e| e.to_string())?;
            conn.execute("DELETE FROM sync WHERE id = ?1", [&sync_id])
                .map_err(|e| e.to_string())?;
            Ok(())
        })
        .await
    }

    // ── Job upsert (used by scan + watcher) ─────────────────────────────

    /// Batch upsert — runs entirely on the DB thread in one shot.
    pub async fn upsert_jobs_batch(
        &self,
        jobs: Vec<(String, String, i64, String)>, // (sync_id, path, size_bytes, fingerprint)
    ) -> Result<u64, String> {
        self.exec(move |conn| {
            let now = now_ms();
            let mut inserted = 0u64;
            for (sync_id, path, size_bytes, fp) in &jobs {
                let id = uuid::Uuid::new_v4().to_string();
                let changed = conn
                    .execute(
                        "INSERT INTO upload_jobs (id, sync_id, path, size_bytes, fingerprint, state, created_at, updated_at)
                         VALUES (?1, ?2, ?3, ?4, ?5, 'pending', ?6, ?6)
                         ON CONFLICT(sync_id, fingerprint) DO UPDATE
                           SET path = excluded.path,
                               size_bytes = excluded.size_bytes,
                               updated_at = excluded.updated_at,
                               state = CASE WHEN upload_jobs.state = 'failed' THEN 'pending' ELSE upload_jobs.state END,
                               last_error = CASE WHEN upload_jobs.state = 'failed' THEN NULL ELSE upload_jobs.last_error END,
                               last_http_status = CASE WHEN upload_jobs.state = 'failed' THEN NULL ELSE upload_jobs.last_http_status END,
                               error_code = CASE WHEN upload_jobs.state = 'failed' THEN NULL ELSE upload_jobs.error_code END,
                               retryable = CASE WHEN upload_jobs.state = 'failed' THEN 0 ELSE upload_jobs.retryable END,
                               next_retry_at = CASE WHEN upload_jobs.state = 'failed' THEN NULL ELSE upload_jobs.next_retry_at END
                         WHERE upload_jobs.state != 'done'",
                        params![id, sync_id, path, size_bytes, fp, now],
                    )
                    .map_err(|e| e.to_string())?;
                if changed > 0 {
                    inserted += 1;
                }
            }
            Ok(inserted)
        })
        .await
    }

    // ── Stabilization ───────────────────────────────────────────────────

    pub async fn stabilize_tick(
        &self,
        sync_id: String,
        batch_size: u32,
        required_ticks: i64,
    ) -> Result<u64, String> {
        self.exec(move |conn| {
            let now = now_ms();
            let mut promoted = 0u64;

            let mut stmt = conn
                .prepare(
                    "SELECT id, path, last_seen_size, stable_ticks
                     FROM upload_jobs
                     WHERE sync_id = ?1 AND state IN ('pending','stabilizing')
                     ORDER BY created_at ASC
                     LIMIT ?2",
                )
                .map_err(|e| e.to_string())?;

            let rows: Vec<(String, String, Option<i64>, i64)> = stmt
                .query_map(params![sync_id, batch_size as i64], |row| {
                    Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
                })
                .map_err(|e| e.to_string())?
                .collect::<Result<Vec<_>, _>>()
                .map_err(|e| e.to_string())?;

            for (id, path, last_seen_size, stable_ticks) in rows {
                let meta = match std::fs::metadata(&path) {
                    Ok(m) => m,
                    Err(_) => {
                        conn.execute(
                            "UPDATE upload_jobs SET state = 'failed', last_error = 'File missing', updated_at = ?2 WHERE id = ?1",
                            params![id, now],
                        ).map_err(|e| e.to_string())?;
                        continue;
                    }
                };

                if std::fs::File::open(&path).is_err() {
                    conn.execute(
                        "UPDATE upload_jobs SET state = 'stabilizing', last_error = 'File not readable', updated_at = ?2 WHERE id = ?1",
                        params![id, now],
                    ).map_err(|e| e.to_string())?;
                    continue;
                }

                let size = meta.len() as i64;
                let next_ticks = if Some(size) == last_seen_size {
                    stable_ticks + 1
                } else {
                    0
                };

                let next_state = if next_ticks >= required_ticks {
                    promoted += 1;
                    "ready"
                } else {
                    "stabilizing"
                };

                conn.execute(
                    "UPDATE upload_jobs
                     SET state = ?2, last_seen_size = ?3, stable_ticks = ?4, last_seen_at = ?5, updated_at = ?5, last_error = NULL
                     WHERE id = ?1",
                    params![id, next_state, size, next_ticks, now],
                ).map_err(|e| e.to_string())?;
            }

            Ok(promoted)
        })
        .await
    }

    // ── Job leasing (for upload worker) ─────────────────────────────────

    /// Lease ready jobs across ALL syncs (for global upload worker).
    pub async fn lease_ready_jobs_global(&self, limit: u32) -> Result<Vec<JobLease>, String> {
        self.exec(move |conn| {
            let now = now_ms();
            let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;

            let leased = {
                let mut stmt = tx
                    .prepare(
                        "SELECT j.id, j.sync_id, s.event_id, j.path, j.size_bytes, j.fingerprint, j.upload_id, j.attempt_count
                         FROM upload_jobs j
                         JOIN sync s ON s.id = j.sync_id
                         WHERE j.state = 'ready'
                           AND (j.next_retry_at IS NULL OR j.next_retry_at <= ?1)
                         ORDER BY j.created_at ASC
                         LIMIT ?2",
                    )
                    .map_err(|e| e.to_string())?;

                let mut rows = stmt
                    .query(params![now, limit as i64])
                    .map_err(|e| e.to_string())?;

                let mut leased: Vec<JobLease> = Vec::new();
                while let Some(row) = rows.next().map_err(|e| e.to_string())? {
                    let id: String = row.get(0).map_err(|e| e.to_string())?;
                    let changed = tx
                        .execute(
                            "UPDATE upload_jobs SET state = 'uploading', attempt_count = attempt_count + 1, updated_at = ?2, last_error = NULL, last_http_status = NULL WHERE id = ?1 AND state = 'ready'",
                            params![id, now],
                        )
                        .map_err(|e| e.to_string())?;

                    if changed == 1 {
                        leased.push(JobLease {
                            id,
                            sync_id: row.get(1).map_err(|e| e.to_string())?,
                            event_id: row.get(2).map_err(|e| e.to_string())?,
                            path: row.get(3).map_err(|e| e.to_string())?,
                            size_bytes: row.get(4).map_err(|e| e.to_string())?,
                            fingerprint: row.get(5).map_err(|e| e.to_string())?,
                            upload_id: row.get(6).map_err(|e| e.to_string())?,
                            attempt_count: row.get::<_, i64>(7).map_err(|e| e.to_string())? + 1,
                        });
                    }
                }
                leased
            };

            tx.commit().map_err(|e| e.to_string())?;
            Ok(leased)
        })
        .await
    }

    // ── Job state transitions ───────────────────────────────────────────

    pub async fn mark_job_done(&self, job_id: String) -> Result<(), String> {
        self.exec(move |conn| {
            conn.execute(
                "UPDATE upload_jobs SET state = 'done', updated_at = ?2, last_error = NULL WHERE id = ?1",
                params![job_id, now_ms()],
            )
            .map_err(|e| e.to_string())?;
            Ok(())
        })
        .await
    }

    pub async fn mark_job_failed(
        &self,
        job_id: String,
        message: String,
        http_status: Option<i64>,
        error_code: Option<String>,
        retryable: bool,
        next_retry_at: Option<i64>,
    ) -> Result<(), String> {
        self.exec(move |conn| {
            conn.execute(
                "UPDATE upload_jobs
                 SET state = 'failed', updated_at = ?2, last_error = ?3,
                     last_http_status = ?4, error_code = ?5,
                     retryable = ?6, next_retry_at = ?7
                 WHERE id = ?1",
                params![
                    job_id,
                    now_ms(),
                    message,
                    http_status,
                    error_code,
                    if retryable { 1 } else { 0 },
                    next_retry_at,
                ],
            )
            .map_err(|e| e.to_string())?;
            Ok(())
        })
        .await
    }

    // ── Auto-retry ──────────────────────────────────────────────────────

    pub async fn auto_requeue_retryable(&self, sync_id: String) -> Result<u64, String> {
        self.exec(move |conn| {
            let now = now_ms();
            let changed = conn
                .execute(
                    "UPDATE upload_jobs
                     SET state = 'ready', next_retry_at = NULL, updated_at = ?2
                     WHERE sync_id = ?1 AND state = 'failed' AND retryable = 1
                       AND next_retry_at IS NOT NULL AND next_retry_at <= ?2",
                    params![sync_id, now],
                )
                .map_err(|e| e.to_string())?;
            Ok(changed as u64)
        })
        .await
    }

    // ── Stats ───────────────────────────────────────────────────────────

    pub async fn job_stats(&self, sync_id: String) -> Result<JobStats, String> {
        self.exec(move |conn| {
            let mut stmt = conn
                .prepare("SELECT state, COUNT(1) FROM upload_jobs WHERE sync_id = ?1 GROUP BY state")
                .map_err(|e| e.to_string())?;

            let mut stats = JobStats {
                pending: 0,
                stabilizing: 0,
                ready: 0,
                uploading: 0,
                done: 0,
                failed: 0,
            };

            let mut rows = stmt.query([&sync_id]).map_err(|e| e.to_string())?;
            while let Some(row) = rows.next().map_err(|e| e.to_string())? {
                let state: String = row.get(0).map_err(|e| e.to_string())?;
                let count: i64 = row.get(1).map_err(|e| e.to_string())?;
                match state.as_str() {
                    "pending" => stats.pending = count,
                    "stabilizing" => stats.stabilizing = count,
                    "ready" => stats.ready = count,
                    "uploading" => stats.uploading = count,
                    "done" => stats.done = count,
                    "failed" => stats.failed = count,
                    _ => {}
                }
            }
            Ok(stats)
        })
        .await
    }
}
