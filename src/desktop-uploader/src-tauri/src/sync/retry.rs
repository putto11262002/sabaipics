use super::db::now_ms;

#[derive(Debug, Clone)]
pub struct RetryDecision {
    pub retryable: bool,
    pub next_retry_at: Option<i64>,
}

fn backoff_ms(attempt: i64, http_status: Option<i64>) -> i64 {
    let base = 1000i64;
    let max = 60_000i64;
    let mut delay = base * (1i64 << attempt.clamp(0, 6));
    if http_status == Some(429) {
        delay = delay.max(15_000);
    }
    delay.min(max)
}

fn next_retry_at(attempt: i64, http_status: Option<i64>) -> Option<i64> {
    Some(now_ms() + backoff_ms(attempt, http_status))
}

pub fn from_http_status(attempt: i64, status: i64) -> RetryDecision {
    let retryable = status == 408 || status == 429 || status >= 500;
    RetryDecision {
        retryable,
        next_retry_at: if retryable {
            next_retry_at(attempt, Some(status))
        } else {
            None
        },
    }
}

pub fn from_intent_failure(attempt: i64, error_code: Option<&str>) -> RetryDecision {
    let retryable = matches!(
        error_code,
        Some("normalization") | Some("r2") | Some("database")
    );
    RetryDecision {
        retryable,
        next_retry_at: if retryable {
            next_retry_at(attempt, None)
        } else {
            None
        },
    }
}

pub fn from_poll_timeout(attempt: i64) -> RetryDecision {
    RetryDecision {
        retryable: true,
        next_retry_at: next_retry_at(attempt, None),
    }
}
