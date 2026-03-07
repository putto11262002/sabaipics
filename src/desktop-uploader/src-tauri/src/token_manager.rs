use crate::sync::db::DbHandle;
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::sync::Mutex;

const EXPIRY_BUFFER_MS: i64 = 60_000; // refresh 60s before expiry
const REFRESH_TIMEOUT_SECS: u64 = 10;
const REFRESH_TOKEN_KEY: &str = "refresh_token";

// ── Public types ────────────────────────────────────────────────────────

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UserInfo {
    pub name: Option<String>,
    pub email: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthStatus {
    pub signed_in: bool,
    pub user: Option<UserInfo>,
}

#[derive(Debug)]
pub enum TokenError {
    NotConfigured,
    NoRefreshToken,
    RefreshFailed(String),
}

impl std::fmt::Display for TokenError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::NotConfigured => write!(f, "Token manager not configured"),
            Self::NoRefreshToken => write!(f, "No refresh token"),
            Self::RefreshFailed(msg) => write!(f, "Refresh failed: {msg}"),
        }
    }
}

// ── Internal types ──────────────────────────────────────────────────────

struct Inner {
    base_url: String,
    access_token: String,
    expires_at: i64, // unix ms
    refresh_token: String,
    user: Option<UserInfo>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct RefreshResponse {
    access_token: String,
    access_token_expires_at: i64,
    refresh_token: Option<String>,
    #[allow(dead_code)]
    refresh_token_expires_at: i64,
    refresh_token_unchanged: Option<bool>,
    user: Option<RefreshUser>,
}

#[derive(serde::Deserialize)]
struct RefreshUser {
    name: Option<String>,
    email: Option<String>,
}

// ── TokenManager ────────────────────────────────────────────────────────

pub struct TokenManager {
    inner: Mutex<Inner>,
    client: reqwest::Client,
    db: DbHandle,
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

impl TokenManager {
    pub fn new(db: DbHandle) -> Self {
        let client = reqwest::Client::builder()
            .user_agent("FrameFast-Desktop/0.1")
            .build()
            .expect("build reqwest client");

        Self {
            inner: Mutex::new(Inner {
                base_url: String::new(),
                access_token: String::new(),
                expires_at: 0,
                refresh_token: String::new(),
                user: None,
            }),
            client,
            db,
        }
    }

    /// Set base URL and attempt to restore session from stored refresh token.
    pub async fn init(&self, base_url: String) -> AuthStatus {
        let refresh_token = self
            .db
            .kv_get(REFRESH_TOKEN_KEY.to_string())
            .await
            .ok()
            .flatten()
            .unwrap_or_default();

        {
            let mut guard = self.inner.lock().await;
            guard.base_url = base_url;
            guard.refresh_token = refresh_token.clone();
        }

        if refresh_token.is_empty() {
            return AuthStatus {
                signed_in: false,
                user: None,
            };
        }

        match self.refresh_and_store().await {
            Ok(status) => status,
            Err(e) => {
                log::warn!("[token] init refresh failed: {e}");
                let _ = self.db.kv_delete(REFRESH_TOKEN_KEY.to_string()).await;
                let mut guard = self.inner.lock().await;
                guard.refresh_token.clear();
                AuthStatus {
                    signed_in: false,
                    user: None,
                }
            }
        }
    }

    /// Store tokens after OAuth redeem (called from frontend).
    pub async fn set_tokens(
        &self,
        access_token: String,
        expires_at: i64,
        refresh_token: String,
        user: Option<UserInfo>,
    ) {
        let _ = self
            .db
            .kv_set(REFRESH_TOKEN_KEY.to_string(), refresh_token.clone())
            .await;

        let mut guard = self.inner.lock().await;
        guard.access_token = access_token;
        guard.expires_at = expires_at;
        guard.refresh_token = refresh_token;
        guard.user = user;
    }

    /// Get a valid access token. Auto-refreshes if expired.
    pub async fn get_token(&self) -> Result<String, TokenError> {
        // Fast path: token is still valid
        {
            let guard = self.inner.lock().await;
            if guard.base_url.is_empty() {
                return Err(TokenError::NotConfigured);
            }
            if guard.refresh_token.is_empty() {
                return Err(TokenError::NoRefreshToken);
            }
            if !guard.access_token.is_empty()
                && now_ms() + EXPIRY_BUFFER_MS < guard.expires_at
            {
                return Ok(guard.access_token.clone());
            }
        }

        // Slow path: need to refresh
        self.refresh_and_store().await?;

        let guard = self.inner.lock().await;
        if guard.access_token.is_empty() {
            return Err(TokenError::RefreshFailed("empty token after refresh".into()));
        }
        Ok(guard.access_token.clone())
    }

    /// Get the API base URL.
    pub async fn base_url(&self) -> String {
        self.inner.lock().await.base_url.clone()
    }

    /// Current auth status (for frontend).
    pub async fn auth_status(&self) -> AuthStatus {
        let guard = self.inner.lock().await;
        AuthStatus {
            signed_in: !guard.refresh_token.is_empty(),
            user: guard.user.clone(),
        }
    }

    /// Clear all tokens (sign out).
    pub async fn clear(&self) {
        let _ = self.db.kv_delete(REFRESH_TOKEN_KEY.to_string()).await;
        let mut guard = self.inner.lock().await;
        guard.access_token.clear();
        guard.expires_at = 0;
        guard.refresh_token.clear();
        guard.user = None;
    }

    // ── Internal ────────────────────────────────────────────────────────

    /// Perform refresh HTTP call and update stored state.
    async fn refresh_and_store(&self) -> Result<AuthStatus, TokenError> {
        let (base_url, refresh_token) = {
            let guard = self.inner.lock().await;
            (guard.base_url.clone(), guard.refresh_token.clone())
        };

        if refresh_token.is_empty() {
            return Err(TokenError::NoRefreshToken);
        }

        let body = self.refresh_http(&base_url, &refresh_token).await?;

        let user = body.user.map(|u| UserInfo {
            name: u.name,
            email: u.email,
        });

        let new_refresh = if body.refresh_token_unchanged.unwrap_or(false) {
            refresh_token
        } else {
            body.refresh_token.unwrap_or(refresh_token)
        };

        let _ = self
            .db
            .kv_set(REFRESH_TOKEN_KEY.to_string(), new_refresh.clone())
            .await;

        let mut guard = self.inner.lock().await;
        guard.access_token = body.access_token;
        guard.expires_at = body.access_token_expires_at;
        guard.refresh_token = new_refresh;
        if user.is_some() {
            guard.user = user.clone();
        }

        Ok(AuthStatus {
            signed_in: true,
            user: guard.user.clone(),
        })
    }

    /// Pure HTTP call — no locking.
    async fn refresh_http(
        &self,
        base_url: &str,
        refresh_token: &str,
    ) -> Result<RefreshResponse, TokenError> {
        let res = self
            .client
            .post(format!("{base_url}/desktop/auth/refresh"))
            .json(&serde_json::json!({ "refreshToken": refresh_token }))
            .timeout(std::time::Duration::from_secs(REFRESH_TIMEOUT_SECS))
            .send()
            .await
            .map_err(|e| TokenError::RefreshFailed(e.to_string()))?;

        if !res.status().is_success() {
            let status = res.status().as_u16();
            let body = res.text().await.unwrap_or_default();
            return Err(TokenError::RefreshFailed(format!(
                "HTTP {status}: {body}"
            )));
        }

        res.json::<RefreshResponse>()
            .await
            .map_err(|e| TokenError::RefreshFailed(format!("parse: {e}")))
    }
}
