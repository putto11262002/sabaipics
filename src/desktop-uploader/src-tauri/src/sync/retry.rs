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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::api::{ApiErrorCode, PipelineErrorCode};

    #[test]
    fn network_error_is_retryable() {
        let d = from_api_error(0, &ApiError::Network("timeout".into()));
        assert!(d.retryable);
        assert!(d.next_retry_at.is_some());
        assert!(d.error_code.is_none());
    }

    #[test]
    fn rate_limited_is_retryable() {
        let d = from_api_error(0, &ApiError::Http {
            status: 429,
            code: ApiErrorCode::RateLimited,
            message: "slow down".into(),
            retry_after_secs: None,
        });
        assert!(d.retryable);
        assert!(d.next_retry_at.is_some());
        assert_eq!(d.error_code, Some("429".into()));
    }

    #[test]
    fn rate_limited_honors_retry_after() {
        let before = now_ms();
        let d = from_api_error(0, &ApiError::Http {
            status: 429,
            code: ApiErrorCode::RateLimited,
            message: "slow down".into(),
            retry_after_secs: Some(30),
        });
        assert!(d.retryable);
        let retry_at = d.next_retry_at.unwrap();
        // Should be at least 30s from now (30_000ms)
        assert!(retry_at >= before + 30_000);
    }

    #[test]
    fn internal_error_is_retryable() {
        let d = from_api_error(0, &ApiError::Http {
            status: 500,
            code: ApiErrorCode::InternalError,
            message: "oops".into(),
            retry_after_secs: None,
        });
        assert!(d.retryable);
        assert!(d.next_retry_at.is_some());
    }

    #[test]
    fn service_unavailable_is_retryable() {
        let d = from_api_error(0, &ApiError::Http {
            status: 503,
            code: ApiErrorCode::ServiceUnavailable,
            message: "down".into(),
            retry_after_secs: None,
        });
        assert!(d.retryable);
    }

    #[test]
    fn payment_required_not_retryable() {
        let d = from_api_error(0, &ApiError::Http {
            status: 402,
            code: ApiErrorCode::PaymentRequired,
            message: "no credits".into(),
            retry_after_secs: None,
        });
        assert!(!d.retryable);
        assert!(d.next_retry_at.is_none());
    }

    #[test]
    fn not_found_not_retryable() {
        let d = from_api_error(0, &ApiError::Http {
            status: 404,
            code: ApiErrorCode::NotFound,
            message: "gone".into(),
            retry_after_secs: None,
        });
        assert!(!d.retryable);
        assert!(d.next_retry_at.is_none());
    }

    #[test]
    fn gone_not_retryable() {
        let d = from_api_error(0, &ApiError::Http {
            status: 410,
            code: ApiErrorCode::Gone,
            message: "expired".into(),
            retry_after_secs: None,
        });
        assert!(!d.retryable);
        assert!(d.next_retry_at.is_none());
    }

    #[test]
    fn conflict_not_retryable() {
        let d = from_api_error(0, &ApiError::Http {
            status: 409,
            code: ApiErrorCode::Conflict,
            message: "state mismatch".into(),
            retry_after_secs: None,
        });
        assert!(!d.retryable);
    }

    #[test]
    fn payload_too_large_not_retryable() {
        let d = from_api_error(0, &ApiError::Http {
            status: 413,
            code: ApiErrorCode::PayloadTooLarge,
            message: "too big".into(),
            retry_after_secs: None,
        });
        assert!(!d.retryable);
    }

    #[test]
    fn bad_request_not_retryable() {
        let d = from_api_error(0, &ApiError::Http {
            status: 400,
            code: ApiErrorCode::BadRequest,
            message: "invalid".into(),
            retry_after_secs: None,
        });
        assert!(!d.retryable);
    }

    #[test]
    fn forbidden_not_retryable() {
        let d = from_api_error(0, &ApiError::Http {
            status: 403,
            code: ApiErrorCode::Forbidden,
            message: "no access".into(),
            retry_after_secs: None,
        });
        assert!(!d.retryable);
    }

    #[test]
    fn presign_expired_retries_quickly() {
        let before = now_ms();
        let d = from_api_error(5, &ApiError::PresignExpired);
        assert!(d.retryable);
        let retry_at = d.next_retry_at.unwrap();
        // Should be ~1s from now regardless of attempt count
        assert!(retry_at <= before + 2000);
        assert_eq!(d.error_code, Some("presign_expired".into()));
    }

    #[test]
    fn poll_timeout_is_retryable() {
        let d = from_api_error(0, &ApiError::PollTimeout);
        assert!(d.retryable);
        assert!(d.next_retry_at.is_some());
        assert_eq!(d.error_code, Some("poll_timeout".into()));
    }

    #[test]
    fn file_error_not_retryable() {
        let d = from_api_error(0, &ApiError::FileError("missing".into()));
        assert!(!d.retryable);
        assert!(d.next_retry_at.is_none());
        assert_eq!(d.error_code, Some("file_error".into()));
    }

    #[test]
    fn pipeline_normalization_is_retryable() {
        let d = from_api_error(0, &ApiError::PipelineFailed {
            code: PipelineErrorCode::Normalization,
            message: "bad image".into(),
        });
        assert!(d.retryable);
        assert_eq!(d.error_code, Some("normalization".into()));
    }

    #[test]
    fn pipeline_r2_is_retryable() {
        let d = from_api_error(0, &ApiError::PipelineFailed {
            code: PipelineErrorCode::R2,
            message: "r2 down".into(),
        });
        assert!(d.retryable);
    }

    #[test]
    fn pipeline_failed_not_retryable() {
        let d = from_api_error(0, &ApiError::PipelineFailed {
            code: PipelineErrorCode::PipelineFailed,
            message: "permanent".into(),
        });
        assert!(!d.retryable);
    }

    #[test]
    fn backoff_increases_with_attempts() {
        let d0 = from_api_error(0, &ApiError::Network("err".into()));
        let d1 = from_api_error(1, &ApiError::Network("err".into()));
        let d2 = from_api_error(2, &ApiError::Network("err".into()));
        // Each attempt should have a later retry time (approximately)
        assert!(d1.next_retry_at.unwrap() > d0.next_retry_at.unwrap());
        assert!(d2.next_retry_at.unwrap() > d1.next_retry_at.unwrap());
    }

    #[test]
    fn backoff_caps_at_60s() {
        let before = now_ms();
        let d = from_api_error(100, &ApiError::Network("err".into()));
        let retry_at = d.next_retry_at.unwrap();
        // Should not exceed 60s from now
        assert!(retry_at <= before + 61_000);
    }

    #[test]
    fn error_code_classification() {
        // Terminal for event
        assert!(ApiErrorCode::NotFound.is_terminal_for_event());
        assert!(ApiErrorCode::Gone.is_terminal_for_event());
        assert!(!ApiErrorCode::RateLimited.is_terminal_for_event());

        // User retryable
        assert!(ApiErrorCode::PaymentRequired.is_user_retryable());
        assert!(!ApiErrorCode::NotFound.is_user_retryable());

        // Auto retryable
        assert!(ApiErrorCode::RateLimited.is_auto_retryable());
        assert!(ApiErrorCode::InternalError.is_auto_retryable());
        assert!(ApiErrorCode::ServiceUnavailable.is_auto_retryable());
        assert!(!ApiErrorCode::PaymentRequired.is_auto_retryable());
    }
}
