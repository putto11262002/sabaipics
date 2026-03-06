CREATE TABLE IF NOT EXISTS sync (
  id TEXT PRIMARY KEY NOT NULL,
  event_id TEXT NOT NULL,
  folder_path TEXT NOT NULL,
  include_subfolders INTEGER NOT NULL DEFAULT 1,
  paused INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS sync_event_id_idx ON sync (event_id);

CREATE TABLE IF NOT EXISTS upload_jobs (
  id TEXT PRIMARY KEY NOT NULL,
  sync_id TEXT NOT NULL,
  path TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  fingerprint TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('pending','stabilizing','ready','uploading','done','failed')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_error TEXT,
  -- stabilization
  last_seen_size INTEGER,
  stable_ticks INTEGER NOT NULL DEFAULT 0,
  last_seen_at INTEGER,
  -- upload tracking
  upload_id TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  next_retry_at INTEGER,
  last_http_status INTEGER,
  -- retry
  retryable INTEGER NOT NULL DEFAULT 1,
  error_code TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS upload_jobs_sync_fp_idx ON upload_jobs (sync_id, fingerprint);
CREATE INDEX IF NOT EXISTS upload_jobs_state_idx ON upload_jobs (state);
CREATE INDEX IF NOT EXISTS upload_jobs_retryable_idx ON upload_jobs (retryable);
