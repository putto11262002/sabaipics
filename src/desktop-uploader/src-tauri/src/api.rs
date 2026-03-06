use std::fmt;
use std::path::Path;

#[derive(Debug)]
pub enum ApiError {
    Network(String),
    Server { status: u16, message: String },
}

impl fmt::Display for ApiError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ApiError::Network(msg) => write!(f, "network error: {msg}"),
            ApiError::Server { status, message } => write!(f, "server error: {status} {message}"),
        }
    }
}

#[async_trait::async_trait]
pub trait ApiClient: Send + Sync {
    async fn upload_photo(&self, event_id: &str, file_path: &Path) -> Result<(), ApiError>;
}

/// Mock client that always succeeds after a short delay.
pub struct MockApiClient;

#[async_trait::async_trait]
impl ApiClient for MockApiClient {
    async fn upload_photo(&self, event_id: &str, file_path: &Path) -> Result<(), ApiError> {
        let file_name = file_path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy();
        log::info!("[mock] uploading {} to event {}", file_name, event_id);
        tokio::time::sleep(std::time::Duration::from_millis(300)).await;
        log::info!("[mock] uploaded {} ✓", file_name);
        Ok(())
    }
}
