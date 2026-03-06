use super::db::DbHandle;
use super::fingerprint;
use notify::{RecursiveMode, Watcher};
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;

const ALLOWED_EXTENSIONS: &[&str] = &["jpg", "jpeg", "png", "heic", "heif", "webp"];

fn is_image(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| ALLOWED_EXTENSIONS.contains(&e.to_lowercase().as_str()))
        .unwrap_or(false)
}

/// Watcher actor: monitors a directory for file changes and enqueues new jobs.
pub async fn run(
    db: DbHandle,
    sync_id: String,
    root: PathBuf,
    recursive: bool,
    cancel: CancellationToken,
    paused: Arc<AtomicBool>,
) {
    let (tx, mut rx) = mpsc::unbounded_channel::<PathBuf>();

    let mode = if recursive {
        RecursiveMode::Recursive
    } else {
        RecursiveMode::NonRecursive
    };

    let mut watcher = match notify::recommended_watcher(move |res: Result<notify::Event, notify::Error>| {
        if let Ok(event) = res {
            for p in event.paths {
                let _ = tx.send(p);
            }
        }
    }) {
        Ok(w) => w,
        Err(e) => {
            log::warn!("[watcher] sync={sync_id} failed to create: {e}");
            return;
        }
    };

    if let Err(e) = watcher.watch(&root, mode) {
        log::warn!("[watcher] sync={sync_id} failed to watch {}: {e}", root.display());
        return;
    }

    log::info!("[watcher] sync={sync_id} watching {} recursive={recursive}", root.display());

    let mut pending: HashSet<PathBuf> = HashSet::new();
    let mut tick = tokio::time::interval(std::time::Duration::from_millis(500));
    tick.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);

    loop {
        tokio::select! {
            _ = cancel.cancelled() => break,
            maybe = rx.recv() => {
                let Some(p) = maybe else { break };
                pending.insert(p);
            }
            _ = tick.tick() => {
                if pending.is_empty() {
                    continue;
                }
                if paused.load(Ordering::Relaxed) {
                    pending.clear();
                    continue;
                }

                let batch: Vec<PathBuf> = pending.drain().collect();
                let sync_id_clone = sync_id.clone();

                // Fingerprint on a blocking thread to avoid blocking tokio
                let jobs = match tokio::task::spawn_blocking(move || {
                    let mut jobs = Vec::new();
                    for path in batch {
                        let meta = match std::fs::metadata(&path) {
                            Ok(m) if m.is_file() && is_image(&path) => m,
                            _ => continue,
                        };
                        let fp = match fingerprint::fingerprint(&path) {
                            Ok(v) => v,
                            Err(_) => continue,
                        };
                        jobs.push((
                            sync_id_clone.clone(),
                            path.to_string_lossy().to_string(),
                            meta.len() as i64,
                            fp,
                        ));
                    }
                    jobs
                }).await {
                    Ok(j) => j,
                    Err(e) => {
                        log::warn!("[watcher] sync={sync_id} fingerprint join error: {e}");
                        continue;
                    }
                };

                if !jobs.is_empty() {
                    match db.upsert_jobs_batch(jobs).await {
                        Ok(n) if n > 0 => log::debug!("[watcher] sync={sync_id} enqueued {n} jobs"),
                        Err(e) => log::warn!("[watcher] sync={sync_id} enqueue failed: {e}"),
                        _ => {}
                    }
                }
            }
        }
    }

    #[allow(unreachable_code)]
    { log::info!("[watcher] sync={sync_id} stopped"); }
}
