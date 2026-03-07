use super::db::now_ms;
use crate::api::ApiError;

#[derive(Debug, Clone)]
pub struct RetryDecision {
    pub retryable: bool,
    pub next_retry_at: Option<i64>,
    pub error_code: Option<String>,
}

fn backoff_ms(attempt: i64, min_delay: Option<u64>) -> i64 {
    let base = 1000i64;
    let max = 60_000i64;
    let delay = base * (1i64 << attempt.clamp(0, 6));
    let delay = match min_delay {
        Some(min) => delay.max(min as i64),
        None => delay,
    };
    delay.min(max)
}

/// Determine retry strategy from an `ApiError`.
pub fn from_api_error(attempt: i64, error: &ApiError) -> RetryDecision {
    match error {
        ApiError::Network(_) => RetryDecision {
            retryable: true,
            next_retry_at: Some(now_ms() + backoff_ms(attempt, None)),
            error_code: None,
        },

        ApiError::Http { status, code, retry_after_secs, .. } => {
            // Honor Retry-After header if present, otherwise use backoff
            let min_delay = retry_after_secs.map(|s| s * 1000);
            let retryable = code.is_auto_retryable();

            RetryDecision {
                retryable,
                next_retry_at: if retryable {
                    Some(now_ms() + backoff_ms(attempt, min_delay))
                } else {
                    None
                },
                error_code: Some(format!("{status}")),
            }
        }

        ApiError::PresignExpired => RetryDecision {
            retryable: true,
            next_retry_at: Some(now_ms() + 1000), // retry quickly, just need re-presign
            error_code: Some("presign_expired".to_string()),
        },

        ApiError::PipelineFailed { code, .. } => {
            let retryable = code.is_retryable();
            RetryDecision {
                retryable,
                next_retry_at: if retryable {
                    Some(now_ms() + backoff_ms(attempt, None))
                } else {
                    None
                },
                error_code: Some(code.to_string()),
            }
        }

        ApiError::PollTimeout => RetryDecision {
            retryable: true,
            next_retry_at: Some(now_ms() + backoff_ms(attempt, None)),
            error_code: Some("poll_timeout".to_string()),
        },

        ApiError::FileError(_) => RetryDecision {
            retryable: false,
            next_retry_at: None,
            error_code: Some("file_error".to_string()),
        },
    }
}
