use std::fmt;
use std::path::Path;

// ── Error types ──────────────────────────────────────────────────────

/// Structured error code from the API JSON response `{ error: { code, message } }`.
#[derive(Debug, Clone)]
pub enum ApiErrorCode {
    NotFound,
    BadRequest,
    PaymentRequired,
    Forbidden,
    Gone,
    PayloadTooLarge,
    RateLimited,
    Conflict,
    InternalError,
    ServiceUnavailable,
    /// Catch-all for unknown codes returned by the API.
    Other(String),
}

impl ApiErrorCode {
    pub fn from_str(s: &str) -> Self {
        match s {
            "NOT_FOUND" => Self::NotFound,
            "BAD_REQUEST" => Self::BadRequest,
            "PAYMENT_REQUIRED" => Self::PaymentRequired,
            "FORBIDDEN" | "ACCOUNT_SUSPENDED" => Self::Forbidden,
            "GONE" => Self::Gone,
            "PAYLOAD_TOO_LARGE" => Self::PayloadTooLarge,
            "RATE_LIMITED" => Self::RateLimited,
            "CONFLICT" => Self::Conflict,
            "INTERNAL_ERROR" => Self::InternalError,
            "SERVICE_UNAVAILABLE" => Self::ServiceUnavailable,
            other => Self::Other(other.to_string()),
        }
    }

    /// Whether this error is retryable without user action.
    pub fn is_auto_retryable(&self) -> bool {
        matches!(
            self,
            Self::RateLimited | Self::InternalError | Self::ServiceUnavailable
        )
    }

    /// Whether this error is retryable after user action (e.g. buy credits).
    pub fn is_user_retryable(&self) -> bool {
        matches!(self, Self::PaymentRequired)
    }

    /// Whether this error means the event is permanently invalid.
    pub fn is_terminal_for_event(&self) -> bool {
        matches!(self, Self::Gone | Self::NotFound)
    }
}

impl fmt::Display for ApiErrorCode {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::NotFound => write!(f, "NOT_FOUND"),
            Self::BadRequest => write!(f, "BAD_REQUEST"),
            Self::PaymentRequired => write!(f, "PAYMENT_REQUIRED"),
            Self::Forbidden => write!(f, "FORBIDDEN"),
            Self::Gone => write!(f, "GONE"),
            Self::PayloadTooLarge => write!(f, "PAYLOAD_TOO_LARGE"),
            Self::RateLimited => write!(f, "RATE_LIMITED"),
            Self::Conflict => write!(f, "CONFLICT"),
            Self::InternalError => write!(f, "INTERNAL_ERROR"),
            Self::ServiceUnavailable => write!(f, "SERVICE_UNAVAILABLE"),
            Self::Other(code) => write!(f, "{code}"),
        }
    }
}

/// Pipeline error codes from Modal callback `{ error: { code, message } }`.
#[derive(Debug, Clone)]
pub enum PipelineErrorCode {
    Normalization,
    R2,
    Database,
    PipelineFailed,
    Other(String),
}

impl PipelineErrorCode {
    pub fn from_str(s: &str) -> Self {
        match s {
            "normalization" => Self::Normalization,
            "r2" => Self::R2,
            "database" => Self::Database,
            "pipeline_failed" => Self::PipelineFailed,
            other => Self::Other(other.to_string()),
        }
    }

    pub fn is_retryable(&self) -> bool {
        matches!(self, Self::Normalization | Self::R2 | Self::Database)
    }
}

impl fmt::Display for PipelineErrorCode {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Normalization => write!(f, "normalization"),
            Self::R2 => write!(f, "r2"),
            Self::Database => write!(f, "database"),
            Self::PipelineFailed => write!(f, "pipeline_failed"),
            Self::Other(code) => write!(f, "{code}"),
        }
    }
}

#[derive(Debug)]
pub enum ApiError {
    /// Network-level failure (DNS, connection refused, timeout, etc.)
    Network(String),

    /// HTTP error from the API with structured error body.
    Http {
        status: u16,
        code: ApiErrorCode,
        message: String,
        retry_after_secs: Option<u64>,
    },

    /// R2 presigned URL rejected (expired or invalid). Should re-presign.
    PresignExpired,

    /// Upload intent reached a terminal failure during pipeline processing.
    PipelineFailed {
        code: PipelineErrorCode,
        message: String,
    },

    /// Poll timed out waiting for intent to reach terminal state.
    PollTimeout,

    /// Local file error (missing, unreadable, etc.)
    FileError(String),
}

impl ApiError {
    pub fn http_status(&self) -> Option<u16> {
        match self {
            Self::Http { status, .. } => Some(*status),
            Self::PresignExpired => Some(403),
            _ => None,
        }
    }
}

impl fmt::Display for ApiError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Network(msg) => write!(f, "Network error: {msg}"),
            Self::Http { status, code, message, .. } => {
                write!(f, "HTTP {status} [{code}]: {message}")
            }
            Self::PresignExpired => write!(f, "Presigned URL expired"),
            Self::PipelineFailed { code, message } => {
                write!(f, "Pipeline failed [{code}]: {message}")
            }
            Self::PollTimeout => write!(f, "Poll timeout waiting for processing"),
            Self::FileError(msg) => write!(f, "File error: {msg}"),
        }
    }
}

// ── API client trait ─────────────────────────────────────────────────

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
