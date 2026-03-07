use crate::api::{ApiClient, ApiError, ApiErrorCode, PipelineErrorCode};
use crate::token_manager::TokenManager;
use std::path::Path;
use std::sync::Arc;

const PRESIGN_TIMEOUT_SECS: u64 = 10;
const UPLOAD_TIMEOUT_SECS: u64 = 120;
const POLL_TIMEOUT_SECS: u64 = 10;
const POLL_INTERVAL_MS: u64 = 2000;
const POLL_MAX_ATTEMPTS: u32 = 60; // 2s * 60 = 2 min max

/// Real HTTP API client that implements the FrameFast upload flow:
/// 1. POST /uploads/presign -> get presigned URL
/// 2. PUT file to R2 via presigned URL
/// 3. GET /uploads/status?ids=... -> poll until completed/failed
pub struct HttpApiClient {
    token_manager: Arc<TokenManager>,
    client: reqwest::Client,
}

impl HttpApiClient {
    pub fn new(token_manager: Arc<TokenManager>) -> Self {
        let client = reqwest::Client::builder()
            .user_agent("FrameFast-Desktop/0.1")
            .build()
            .expect("build reqwest client");

        Self {
            token_manager,
            client,
        }
    }
}

// ── JSON response shapes ────────────────────────────────────────────────

#[derive(serde::Deserialize)]
struct PresignResponse {
    data: PresignData,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct PresignData {
    upload_id: String,
    put_url: String,
    required_headers: std::collections::HashMap<String, String>,
}

#[derive(serde::Deserialize)]
struct StatusResponse {
    data: Vec<IntentStatus>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct IntentStatus {
    status: String,
    error_code: Option<String>,
    error_message: Option<String>,
}

#[derive(serde::Deserialize)]
struct ApiErrorBody {
    error: Option<ApiErrorDetail>,
}

#[derive(serde::Deserialize)]
struct ApiErrorDetail {
    code: Option<String>,
    message: Option<String>,
}

// ── Helpers ─────────────────────────────────────────────────────────────

fn parse_api_error(status: u16, body: &str, retry_after: Option<u64>) -> ApiError {
    let (code_str, message) = match serde_json::from_str::<ApiErrorBody>(body) {
        Ok(b) => {
            let detail = b.error.unwrap_or(ApiErrorDetail {
                code: None,
                message: None,
            });
            (
                detail.code.unwrap_or_else(|| format!("{status}")),
                detail.message.unwrap_or_else(|| format!("HTTP {status}")),
            )
        }
        Err(_) => (format!("{status}"), format!("HTTP {status}")),
    };

    ApiError::Http {
        status,
        code: ApiErrorCode::from_str(&code_str),
        message,
        retry_after_secs: retry_after,
    }
}

fn content_type_for_path(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
        .as_deref()
    {
        Some("jpg" | "jpeg") => "image/jpeg",
        Some("png") => "image/png",
        Some("webp") => "image/webp",
        _ => "image/jpeg", // default assumption
    }
}

// ── ApiClient impl ──────────────────────────────────────────────────────

#[async_trait::async_trait]
impl ApiClient for HttpApiClient {
    async fn upload_photo(&self, event_id: &str, file_path: &Path) -> Result<(), ApiError> {
        let base_url = self.token_manager.base_url().await;
        let token = self
            .token_manager
            .get_token()
            .await
            .map_err(|e| ApiError::Network(e.to_string()))?;

        // Read file
        let file_bytes = tokio::fs::read(file_path)
            .await
            .map_err(|e| ApiError::FileError(e.to_string()))?;

        let content_type = content_type_for_path(file_path);
        let content_length = file_bytes.len();
        let filename = file_path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();

        // Step 1: Presign
        let presign_body = serde_json::json!({
            "eventId": event_id,
            "contentType": content_type,
            "contentLength": content_length,
            "filename": filename,
            "source": "desktop"
        });

        let presign_res = self
            .client
            .post(format!("{}/uploads/presign", base_url))
            .bearer_auth(&token)
            .json(&presign_body)
            .timeout(std::time::Duration::from_secs(PRESIGN_TIMEOUT_SECS))
            .send()
            .await
            .map_err(|e| ApiError::Network(e.to_string()))?;

        if !presign_res.status().is_success() {
            let status = presign_res.status().as_u16();
            let retry_after = presign_res
                .headers()
                .get("retry-after")
                .and_then(|v| v.to_str().ok())
                .and_then(|v| v.parse::<u64>().ok());
            let body = presign_res
                .text()
                .await
                .unwrap_or_default();
            return Err(parse_api_error(status, &body, retry_after));
        }

        let presign: PresignResponse = presign_res
            .json()
            .await
            .map_err(|e| ApiError::Network(format!("presign parse: {e}")))?;

        // Step 2: PUT to R2
        let mut put_req = self
            .client
            .put(&presign.data.put_url)
            .timeout(std::time::Duration::from_secs(UPLOAD_TIMEOUT_SECS));

        for (key, value) in &presign.data.required_headers {
            put_req = put_req.header(key.as_str(), value.as_str());
        }

        let put_res = put_req
            .body(file_bytes)
            .send()
            .await
            .map_err(|e| ApiError::Network(e.to_string()))?;

        if !put_res.status().is_success() {
            let status = put_res.status().as_u16();
            if status == 403 {
                return Err(ApiError::PresignExpired);
            }
            return Err(ApiError::Network(format!(
                "R2 PUT failed: HTTP {status}"
            )));
        }

        // Step 3: Poll status
        let upload_id = &presign.data.upload_id;
        for _ in 0..POLL_MAX_ATTEMPTS {
            tokio::time::sleep(std::time::Duration::from_millis(POLL_INTERVAL_MS)).await;

            let status_res = self
                .client
                .get(format!("{}/uploads/status", base_url))
                .bearer_auth(&token)
                .query(&[("ids", upload_id.as_str())])
                .timeout(std::time::Duration::from_secs(POLL_TIMEOUT_SECS))
                .send()
                .await
                .map_err(|e| ApiError::Network(e.to_string()))?;

            if !status_res.status().is_success() {
                let status = status_res.status().as_u16();
                let retry_after = status_res
                    .headers()
                    .get("retry-after")
                    .and_then(|v| v.to_str().ok())
                    .and_then(|v| v.parse::<u64>().ok());
                let body = status_res.text().await.unwrap_or_default();
                return Err(parse_api_error(status, &body, retry_after));
            }

            let status_body: StatusResponse = status_res
                .json()
                .await
                .map_err(|e| ApiError::Network(format!("status parse: {e}")))?;

            let intent = match status_body.data.first() {
                Some(i) => i,
                None => continue,
            };

            match intent.status.as_str() {
                "completed" => return Ok(()),
                "failed" => {
                    let code = intent
                        .error_code
                        .as_deref()
                        .unwrap_or("pipeline_failed");
                    let message = intent
                        .error_message
                        .as_deref()
                        .unwrap_or("Processing failed");
                    return Err(ApiError::PipelineFailed {
                        code: PipelineErrorCode::from_str(code),
                        message: message.to_string(),
                    });
                }
                "expired" => return Err(ApiError::PresignExpired),
                _ => continue, // pending, processing
            }
        }

        Err(ApiError::PollTimeout)
    }
}
