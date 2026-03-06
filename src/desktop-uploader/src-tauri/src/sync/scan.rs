use super::db::DbHandle;
use super::fingerprint;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use walkdir::WalkDir;

const ALLOWED_EXTENSIONS: &[&str] = &["jpg", "jpeg", "png", "heic", "heif", "webp"];
const FINGERPRINT_CONCURRENCY: usize = 8;

fn is_image(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| ALLOWED_EXTENSIONS.contains(&e.to_lowercase().as_str()))
        .unwrap_or(false)
}

/// Walk the directory, fingerprint files in parallel, and batch-upsert to DB.
pub async fn scan(
    db: &DbHandle,
    sync_id: &str,
    root: &Path,
    recursive: bool,
) -> Result<u64, String> {
    log::info!("[scan] sync={sync_id} root={} recursive={recursive}", root.display());

    // Phase 1: Collect image paths (fast, blocking but cheap)
    let root = root.to_path_buf();
    let paths = tokio::task::spawn_blocking(move || {
        let mut walker = WalkDir::new(&root);
        if !recursive {
            walker = walker.max_depth(1);
        }
        walker
            .into_iter()
            .filter_map(Result::ok)
            .filter(|e| e.file_type().is_file() && is_image(e.path()))
            .map(|e| e.path().to_path_buf())
            .collect::<Vec<PathBuf>>()
    })
    .await
    .map_err(|e| format!("walk join: {e}"))?;

    if paths.is_empty() {
        log::info!("[scan] sync={sync_id} no images found");
        return Ok(0);
    }

    log::info!("[scan] sync={sync_id} found {} image files, fingerprinting...", paths.len());

    // Phase 2: Fingerprint in parallel using spawn_blocking + semaphore
    let sem = Arc::new(tokio::sync::Semaphore::new(FINGERPRINT_CONCURRENCY));
    let mut set = tokio::task::JoinSet::new();
    let sync_id_owned = sync_id.to_string();

    for path in paths {
        let permit = sem.clone().acquire_owned().await.map_err(|e| e.to_string())?;
        let sync_id = sync_id_owned.clone();

        set.spawn(tokio::task::spawn_blocking(move || {
            let _permit = permit;
            let meta = match std::fs::metadata(&path) {
                Ok(m) => m,
                Err(_) => return None,
            };
            let fp = match fingerprint::fingerprint(&path) {
                Ok(v) => v,
                Err(_) => return None,
            };
            Some((sync_id, path.to_string_lossy().to_string(), meta.len() as i64, fp))
        }));
    }

    let mut batch = Vec::new();
    while let Some(result) = set.join_next().await {
        if let Ok(Ok(Some(job))) = result {
            batch.push(job);
        }
    }

    // Phase 3: Batch upsert to DB (runs on DB actor thread)
    let inserted = db.upsert_jobs_batch(batch).await?;
    log::info!("[scan] sync={sync_id_owned} inserted={inserted}");
    Ok(inserted)
}
