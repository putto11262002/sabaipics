# LINE Login OAuth 2.0 Research

**Research Date:** 2025-12-03
**LINE Login API Version:** v2.1

## Summary

LINE Login implements standard OAuth 2.0 authorization code flow for web applications. It provides user authentication and profile access through well-defined endpoints. After successful authentication, you can retrieve user profile data including userId (unique identifier), displayName, and pictureUrl. LINE Login supports granular permission scopes (profile, openid, email) and provides mechanisms to link user accounts with LINE Official Accounts for subsequent messaging capabilities.

## OAuth 2.0 Flow Steps

### 1. Authorization Request

Redirect users to LINE's authorization endpoint with required parameters.

**Endpoint:**

```
https://access.line.me/oauth2/v2.1/authorize
```

**Required Parameters:**

- `response_type`: Must be `code` (authorization code flow)
- `client_id`: Your LINE Login Channel ID from LINE Developers Console
- `redirect_uri`: URL-encoded callback URL (must match registered URL)
- `state`: Random string for CSRF protection (verify on callback)
- `scope`: Space-separated permissions (e.g., `profile openid email`)

**Optional Parameters:**

- `bot_prompt`: `normal` or `aggressive` - Shows option to add Official Account as friend
- `prompt`: `consent` - Forces consent screen display
- `nonce`: Random value included in ID token (recommended for security)
- `ui_locales`: Preferred language (e.g., `en`, `ja`, `th`)
- `max_age`: Max authentication age in seconds
- `initial_amr_display`: Login method preference

**Example Authorization URL:**

```
https://access.line.me/oauth2/v2.1/authorize
  ?response_type=code
  &client_id=YOUR_CHANNEL_ID
  &redirect_uri=https%3A%2F%2Fyourapp.com%2Fcallback
  &state=RANDOM_STATE_STRING
  &scope=profile%20openid%20email
  &bot_prompt=normal
```

### 2. User Authorization

- User logs into LINE (if not already authenticated)
- User reviews requested permissions
- User grants or denies access
- Optionally adds Official Account as friend (if `bot_prompt` used)

### 3. Authorization Callback

LINE redirects back to your `redirect_uri` with:

**Success Response:**

```
https://yourapp.com/callback
  ?code=AUTHORIZATION_CODE
  &state=RANDOM_STATE_STRING
  &friendship_status_changed=true  (if Official Account friend status changed)
```

**Error Response:**

```
https://yourapp.com/callback
  ?error=access_denied
  &error_description=user_cancel
  &state=RANDOM_STATE_STRING
```

**Important:** Always verify the `state` parameter matches your original value.

### 4. Token Exchange

Exchange authorization code for access tokens via server-side request.

**Endpoint:**

```
POST https://api.line.me/oauth2/v2.1/token
```

**Request Headers:**

```
Content-Type: application/x-www-form-urlencoded
```

**Request Body Parameters:**

- `grant_type`: Must be `authorization_code`
- `code`: Authorization code from callback
- `redirect_uri`: Same URI used in authorization request
- `client_id`: Your Channel ID
- `client_secret`: Your Channel Secret

**Example Request:**

```bash
curl -X POST https://api.line.me/oauth2/v2.1/token \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d 'grant_type=authorization_code' \
  -d 'code=AUTHORIZATION_CODE' \
  -d 'redirect_uri=https://yourapp.com/callback' \
  -d 'client_id=YOUR_CHANNEL_ID' \
  -d 'client_secret=YOUR_CHANNEL_SECRET'
```

**Success Response (200 OK):**

```json
{
  "access_token": "eyJhbGci...",
  "expires_in": 2592000,
  "id_token": "eyJhbGci...",
  "refresh_token": "eyJhbGci...",
  "scope": "profile openid email",
  "token_type": "Bearer"
}
```

**Token Validity:**

- Access Token: 30 days (2,592,000 seconds)
- Refresh Token: 90 days
- ID Token: JWT format, no expiration for profile data

### 5. Refresh Access Token (Optional)

When access token expires, use refresh token to get new tokens without re-authentication.

**Endpoint:**

```
POST https://api.line.me/oauth2/v2.1/token
```

**Request Body:**

- `grant_type`: Must be `refresh_token`
- `refresh_token`: Refresh token from previous response
- `client_id`: Your Channel ID
- `client_secret`: Your Channel Secret

## Available User Data After Auth

### Get User Profile

**Endpoint:**

```
GET https://api.line.me/v2/profile
```

**Request Headers:**

```
Authorization: Bearer ACCESS_TOKEN
```

**Response (200 OK):**

```json
{
  "userId": "U1234567890abcdef1234567890abcdef",
  "displayName": "John Doe",
  "pictureUrl": "https://profile.line-scdn.net/0h1234abcd...",
  "statusMessage": "Hello World!"
}
```

**Profile Data Fields:**

- `userId` (string): Unique user identifier (33 characters, format: `U` + 32 hex chars)
- `displayName` (string): User's display name in LINE
- `pictureUrl` (string): HTTPS URL to profile picture
  - Append `/large` for large thumbnail
  - Append `/small` for small thumbnail
- `statusMessage` (string, optional): User's status message

### Get User Info (OpenID Connect)

Alternative endpoint using OpenID Connect standard.

**Endpoint:**

```
GET https://api.line.me/oauth2/v2.1/userinfo
```

**Request Headers:**

```
Authorization: Bearer ACCESS_TOKEN
```

**Response:**

```json
{
  "sub": "U1234567890abcdef1234567890abcdef",
  "name": "John Doe",
  "picture": "https://profile.line-scdn.net/0h1234abcd...",
  "email": "user@example.com"
}
```

**Fields:**

- `sub`: User ID (same as `userId`)
- `name`: Display name
- `picture`: Profile picture URL
- `email`: Email address (only if `email` scope granted and verified)

### ID Token (JWT)

The `id_token` returned during token exchange contains user claims in JWT format.

**Decode ID Token to get:**

```json
{
  "iss": "https://access.line.me",
  "sub": "U1234567890abcdef1234567890abcdef",
  "aud": "YOUR_CHANNEL_ID",
  "exp": 1234567890,
  "iat": 1234567890,
  "name": "John Doe",
  "picture": "https://profile.line-scdn.net/0h1234abcd...",
  "email": "user@example.com"
}
```

**Important:** Always verify ID token signature before using claims. Use LINE's public keys from:

```
https://api.line.me/oauth2/v2.1/certs
```

## LINE User ID Format

**Format:** `U` followed by 32 hexadecimal characters
**Length:** 33 characters total
**Example:** `U1234567890abcdef1234567890abcdef`

**Characteristics:**

- Unique per user per channel
- Persistent (doesn't change)
- Different across different channels (same user has different IDs in different apps)
- Case-sensitive
- Used for all LINE Platform APIs

## Scopes and Permissions

LINE Login supports granular permission control through scopes.

### Available Scopes

| Scope     | Description       | Provides                               |
| --------- | ----------------- | -------------------------------------- |
| `profile` | User profile info | displayName, pictureUrl, statusMessage |
| `openid`  | OpenID Connect    | userId (sub)                           |
| `email`   | Email address     | email (requires approval)              |

### Scope Combinations & Data Access

| Scopes Requested       | User ID | Display Name | Picture | Email |
| ---------------------- | ------- | ------------ | ------- | ----- |
| `profile`              | ✗       | ✓            | ✓       | ✗     |
| `openid`               | ✓       | ✗            | ✗       | ✗     |
| `profile openid`       | ✓       | ✓            | ✓       | ✗     |
| `openid email`         | ✓       | ✗            | ✗       | ✓     |
| `profile openid email` | ✓       | ✓            | ✓       | ✓     |

**Notes:**

- `openid` scope is required to receive `id_token` and access userinfo endpoint
- `profile` scope is required for display name and picture
- `email` scope requires separate application to LINE for approval
- Scopes are space-separated in requests
- Users see consent screen showing exactly what data you're requesting

### Recommended Scope for Most Apps

```
profile openid
```

This provides both user identification and basic profile information.

## Linking LINE Login to Official Account for Messaging

LINE Login and LINE Messaging API (Official Accounts) are separate but can be linked.

### Method 1: Add Friend Option During Login

Use `bot_prompt` parameter in authorization request:

**Options:**

- `bot_prompt=normal`: Shows option to add Official Account (default behavior)
- `bot_prompt=aggressive`: Highlights the option more prominently

**Authorization URL with bot_prompt:**

```
https://access.line.me/oauth2/v2.1/authorize
  ?response_type=code
  &client_id=YOUR_CHANNEL_ID
  &redirect_uri=https://yourapp.com/callback
  &state=STATE
  &scope=profile openid
  &bot_prompt=normal
```

**Callback Response:**

```
https://yourapp.com/callback
  ?code=CODE
  &state=STATE
  &friendship_status_changed=true
```

The `friendship_status_changed=true` parameter indicates user's friend status changed (added or blocked).

### Method 2: Check Friendship Status

After authentication, check if user is friend with your Official Account.

**Endpoint:**

```
GET https://api.line.me/friendship/v1/status
```

**Request Headers:**

```
Authorization: Bearer ACCESS_TOKEN
```

**Response:**

```json
{
  "friendFlag": true
}
```

- `friendFlag: true` - User has Official Account as friend
- `friendFlag: false` - User doesn't have Official Account as friend

### Method 3: Link User ID for Messaging

**Important Concepts:**

1. **LINE Login userId**: User identifier from LINE Login (starts with `U`)
2. **Messaging API userId**: Same format, but obtained from webhook events

**Key Point:** The LINE Login userId and Messaging API userId are **THE SAME** if:

- Your LINE Login channel and Messaging API channel are linked in LINE Developers Console
- User has both logged in AND added your Official Account as friend

**Linking Channels in Console:**

1. Go to LINE Developers Console
2. Open your LINE Login channel
3. Navigate to "Linked OA" tab
4. Link your LINE Official Account (Messaging API channel)

**After Linking:**

- When user logs in via LINE Login and adds your Official Account, their `userId` will be consistent across both
- You can store the `userId` from LINE Login in your database
- When user sends message to Official Account, webhook event contains same `userId`
- You can then match the user and send personalized messages

**Workflow:**

```
1. User logs in via LINE Login
   → You get userId: U1234567890abcdef...
   → Store in your database with user data

2. User adds your Official Account as friend
   → Webhook event received with userId: U1234567890abcdef...
   → Match with stored userId

3. Send messages to user
   → Use Messaging API with stored userId
   → POST https://api.line.me/v2/bot/message/push
```

### Method 4: Send Messages via Messaging API

Once you have the userId and user is friends with your Official Account:

**Endpoint:**

```
POST https://api.line.me/v2/bot/message/push
```

**Request Headers:**

```
Content-Type: application/json
Authorization: Bearer CHANNEL_ACCESS_TOKEN
```

(Note: This is your Messaging API channel access token, NOT the user's LINE Login access token)

**Request Body:**

```json
{
  "to": "U1234567890abcdef1234567890abcdef",
  "messages": [
    {
      "type": "text",
      "text": "Hello from our web app!"
    }
  ]
}
```

**Important:**

- Must use Messaging API channel access token (not user's access token)
- User must have your Official Account as friend
- Subject to Messaging API rate limits and pricing

## Security Best Practices

### 1. State Parameter

- Generate cryptographically secure random string for each authorization request
- Store in session
- Verify matches on callback
- Prevents CSRF attacks

### 2. PKCE (Proof Key for Code Exchange)

LINE Login supports PKCE for enhanced security (recommended for public clients):

- Generate `code_verifier`: Random 43-128 character string
- Calculate `code_challenge`: Base64URL(SHA256(code_verifier))
- Include `code_challenge` and `code_challenge_method=S256` in authorization request
- Include `code_verifier` in token exchange request

### 3. Nonce Parameter

- Include random `nonce` in authorization request
- Verify same nonce appears in ID token
- Prevents replay attacks

### 4. ID Token Verification

Always verify ID token before trusting claims:

1. Verify signature using LINE's public keys
2. Verify `iss` claim equals `https://access.line.me`
3. Verify `aud` claim equals your Channel ID
4. Verify `exp` claim hasn't passed
5. Verify `nonce` if you sent one

### 5. HTTPS Only

- All redirect URIs must use HTTPS (except localhost for development)
- Never send tokens over unencrypted connections

### 6. Token Storage

- Store access tokens and refresh tokens securely server-side
- Never expose tokens in client-side code
- Use secure session management

### 7. Channel Secret Protection

- Never expose Channel Secret in client-side code
- Keep it in environment variables or secure configuration
- Rotate if compromised

## Rate Limiting

LINE implements rate limiting but doesn't publish specific thresholds. Best practices:

- Cache user profile data when possible
- Implement exponential backoff for retries
- Monitor for 429 (Too Many Requests) responses
- Use `x-line-request-id` header for debugging

## Error Handling

### Authorization Errors (Callback)

| Error Code                  | Description                 | Action                             |
| --------------------------- | --------------------------- | ---------------------------------- |
| `access_denied`             | User declined authorization | Show friendly message, allow retry |
| `invalid_request`           | Malformed request           | Check parameters                   |
| `unauthorized_client`       | Invalid client_id           | Verify Channel ID                  |
| `unsupported_response_type` | Invalid response_type       | Must be `code`                     |
| `invalid_scope`             | Invalid scope value         | Check scope format                 |
| `server_error`              | LINE server error           | Retry later                        |

### Token Exchange Errors

| HTTP Status | Error             | Description                        |
| ----------- | ----------------- | ---------------------------------- |
| 400         | `invalid_request` | Missing required parameter         |
| 400         | `invalid_grant`   | Invalid/expired authorization code |
| 400         | `invalid_client`  | Invalid client credentials         |
| 401         | `unauthorized`    | Authentication failed              |
| 500         | `server_error`    | LINE server error                  |

### API Request Errors

| HTTP Status | Description                                 |
| ----------- | ------------------------------------------- |
| 400         | Bad Request - Check parameters              |
| 401         | Unauthorized - Invalid/expired access token |
| 403         | Forbidden - Insufficient permissions        |
| 429         | Too Many Requests - Rate limit exceeded     |
| 500         | Internal Server Error - Retry later         |

## Complete Implementation Example

### Step-by-Step Web App Integration

```javascript
// 1. Generate authorization URL (server-side)
const crypto = require('crypto');

function generateAuthUrl(channelId, redirectUri, scope = 'profile openid') {
  const state = crypto.randomBytes(16).toString('hex');
  // Store state in session for verification

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: channelId,
    redirect_uri: redirectUri,
    state: state,
    scope: scope,
    bot_prompt: 'normal',
  });

  return `https://access.line.me/oauth2/v2.1/authorize?${params.toString()}`;
}

// 2. Handle callback (server-side)
async function handleCallback(req) {
  const { code, state, friendship_status_changed } = req.query;

  // Verify state
  if (state !== req.session.state) {
    throw new Error('Invalid state parameter');
  }

  // Exchange code for tokens
  const tokenResponse = await fetch('https://api.line.me/oauth2/v2.1/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: process.env.REDIRECT_URI,
      client_id: process.env.CHANNEL_ID,
      client_secret: process.env.CHANNEL_SECRET,
    }),
  });

  const tokens = await tokenResponse.json();
  // tokens = { access_token, expires_in, id_token, refresh_token, scope, token_type }

  return tokens;
}

// 3. Get user profile (server-side)
async function getUserProfile(accessToken) {
  const response = await fetch('https://api.line.me/v2/profile', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const profile = await response.json();
  // profile = { userId, displayName, pictureUrl, statusMessage }

  return profile;
}

// 4. Check friendship status (server-side)
async function checkFriendship(accessToken) {
  const response = await fetch('https://api.line.me/friendship/v1/status', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const { friendFlag } = await response.json();
  return friendFlag;
}

// 5. Send message via Messaging API (server-side)
async function sendMessage(userId, text) {
  const response = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.MESSAGING_API_TOKEN}`,
    },
    body: JSON.stringify({
      to: userId,
      messages: [{ type: 'text', text: text }],
    }),
  });

  return response.ok;
}
```

## Key Takeaways for FaceLink Implementation

### What We Can Get After Authentication

1. **User Identification**: Unique `userId` (33 chars, format: `U` + 32 hex)
2. **User Profile**: Display name, profile picture URL
3. **Email**: If approved and user consents (requires separate approval)
4. **Friend Status**: Check if user has Official Account as friend

### Messaging Capability

- LINE Login alone CANNOT send messages to users
- Must link to LINE Official Account (Messaging API)
- User must actively add Official Account as friend
- Can encourage during login with `bot_prompt` parameter
- Once linked, can use same `userId` for push messages

### Recommended Flow for FaceLink

1. User logs in via LINE Login (`profile openid` scope)
2. Store `userId`, display name, picture URL in database
3. Show option to add Official Account for photo notifications
4. When user adds Official Account, webhook provides same `userId`
5. Can now send photo notifications via Messaging API

### Limitations

- Cannot send messages without Official Account friendship
- Cannot force users to add Official Account
- Messaging API has rate limits and costs
- Different userId per channel (cannot use same ID across different apps)

## Sources

- [LINE Login Documentation - Integrate LINE Login](https://developers.line.biz/en/docs/line-login/integrate-line-login/)
- [LINE Login API Reference v2.1](https://developers.line.biz/en/reference/line-login/)
- [LINE Developers - LIFF SDK Documentation](https://developers.line.biz/en/docs/liff/)
- [LINE Messaging API Documentation](https://developers.line.biz/en/docs/messaging-api/)
- [OAuth 2.0 RFC 6749](https://datatracker.ietf.org/doc/html/rfc6749)
- [OpenID Connect Core Specification](https://openid.net/specs/openid-connect-core-1_0.html)

---

**Document Version:** 1.0
**Last Updated:** 2025-12-03
**Reviewed By:** Claude (Anthropic)
