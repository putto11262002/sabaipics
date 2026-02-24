# Clerk Integration Research

**Status:** Complete
**Date:** 2025-12-06

---

## Overview

Comprehensive research on integrating Clerk authentication across all FaceLink platforms.

| Platform                           | Approach                                                       |
| ---------------------------------- | -------------------------------------------------------------- |
| React Web (Dashboard, Participant) | Full `@clerk/clerk-react` SDK                                  |
| Hono API (Cloudflare Workers)      | `@clerk/backend` for JWT verification                          |
| Wails Desktop                      | Custom auth context + Go OAuth + `@clerk/backend` verification |

---

# Part 1: Hono API Integration (@clerk/backend)

## 1.1 Package Choice

| Option                      | Decision                    |
| --------------------------- | --------------------------- |
| `@clerk/backend` (official) | ✅ Use this                 |
| `clerk-hono` (community)    | ❌ Skip - want full control |

**Why @clerk/backend:**

- Official Clerk package, maintained by Clerk team
- Framework-agnostic, works with Web standard Request/Response
- Built specifically for V8 isolates (Cloudflare Workers)
- Full control over middleware implementation

## 1.2 Networkless JWT Verification

**Key Discovery:** Can verify JWTs without network calls.

| Approach                          | Latency   | Use          |
| --------------------------------- | --------- | ------------ |
| Network (fetch JWKS each request) | +50-200ms | ❌ Don't use |
| Networkless (cached public key)   | ~0ms      | ✅ Use this  |

**How it works:**

1. Get JWKS Public Key from Clerk Dashboard → API Keys
2. Store in Cloudflare Secrets as `CLERK_JWT_KEY`
3. Pass to client: `createClerkClient({ jwtKey: env.CLERK_JWT_KEY })`
4. JWT signature verified locally, no network call

**When key changes:** Only when you rotate Clerk keys (rare). Update env var.

## 1.3 Environment Variables

| Variable                | Purpose                  | Storage            |
| ----------------------- | ------------------------ | ------------------ |
| `CLERK_PUBLISHABLE_KEY` | Frontend init            | `.env` (public)    |
| `CLERK_SECRET_KEY`      | Clerk API calls          | Cloudflare Secrets |
| `CLERK_JWT_KEY`         | Networkless verification | Cloudflare Secrets |

## 1.4 Verification Flow

```
Request arrives
    ↓
Extract "Authorization: Bearer {token}" header
    ↓
createClerkClient({ secretKey, jwtKey })
    ↓
authenticateRequest(request, { authorizedParties, jwtKey })
    ↓
requestState.toAuth() → { userId, sessionId }
    ↓
c.set('auth', auth) → Handler uses c.get('auth')
```

## 1.5 Auth Object Contents

| Field       | Type             | Description             |
| ----------- | ---------------- | ----------------------- |
| `userId`    | `string \| null` | Clerk user ID           |
| `sessionId` | `string \| null` | Current session ID      |
| `orgId`     | `string \| null` | Organization (not used) |

## 1.6 Middleware Composition Pattern

| Middleware            | Behavior                                                     |
| --------------------- | ------------------------------------------------------------ |
| `authMiddleware`      | Verifies token, sets context, allows unauthenticated through |
| `requireAuth`         | Returns 401 if no auth                                       |
| `requirePhotographer` | Returns 403 if not photographer                              |

**Pattern:** Base middleware extracts + sets context. Route-specific middleware enforces requirements.

## 1.7 Authorized Parties (azp claim)

Validates token was issued for your application.

| Environment | Authorized Parties                                   |
| ----------- | ---------------------------------------------------- |
| Production  | `https://app.facelink.co`, `https://get.facelink.co` |
| Desktop     | App-specific scheme                                  |
| Development | `http://localhost:3000`, `http://localhost:5173`     |

## 1.8 Error Responses

| Scenario                | Status | Code             |
| ----------------------- | ------ | ---------------- |
| No Authorization header | 401    | `NO_AUTH`        |
| Invalid token format    | 400    | `INVALID_FORMAT` |
| Expired token           | 401    | `TOKEN_EXPIRED`  |
| Invalid signature       | 401    | `INVALID_TOKEN`  |
| Wrong `azp` claim       | 403    | `FORBIDDEN`      |

---

# Part 2: React Web Integration (@clerk/clerk-react)

## 2.1 When to Use

| Platform                          | Use Clerk React SDK?   |
| --------------------------------- | ---------------------- |
| Dashboard (app.facelink.co)       | ✅ Yes                 |
| Participant web (get.facelink.co) | ✅ Yes                 |
| Wails Desktop                     | ❌ No (custom context) |

## 2.2 Setup

Wrap app with `ClerkProvider`:

| Prop                        | Required | Purpose                        |
| --------------------------- | -------- | ------------------------------ |
| `publishableKey`            | Yes      | From Clerk Dashboard           |
| `signInFallbackRedirectUrl` | No       | Default redirect after sign-in |
| `afterSignOutUrl`           | No       | Redirect after sign-out        |

## 2.3 Key Hooks

| Hook        | Returns                                               | Use For               |
| ----------- | ----------------------------------------------------- | --------------------- |
| `useAuth()` | `{ getToken, isSignedIn, isLoaded, userId, signOut }` | Auth state, API calls |
| `useUser()` | `{ user, isLoaded, isSignedIn }`                      | User profile data     |

**`getToken()` behavior:**

- Returns `Promise<string | null>`
- Automatically refreshes expired tokens
- Call every time before API request (always fresh)

## 2.4 Key Components

| Component            | Purpose                            |
| -------------------- | ---------------------------------- |
| `<ClerkProvider>`    | Context provider (wrap app)        |
| `<SignedIn>`         | Render only when authenticated     |
| `<SignedOut>`        | Render only when NOT authenticated |
| `<SignIn>`           | Full sign-in UI                    |
| `<UserButton>`       | Avatar + dropdown                  |
| `<RedirectToSignIn>` | Redirect component                 |

## 2.5 API Calls Pattern

| Request Type | Token Handling                                |
| ------------ | --------------------------------------------- |
| Same-origin  | Automatic (cookie)                            |
| Cross-origin | Manual `Authorization: Bearer {token}` header |

**Cross-origin flow:**

1. `const { getToken } = useAuth()`
2. `const token = await getToken()`
3. `fetch(url, { headers: { Authorization: \`Bearer ${token}\` } })`

**Token refresh:** Automatic - `getToken()` always returns valid token.

---

# Part 3: Wails Desktop Integration

## 3.1 Key Discovery: Why Clerk SDK Won't Work in Desktop

| Issue                                         | Explanation                                               |
| --------------------------------------------- | --------------------------------------------------------- |
| OAuth providers block webviews                | Google, etc. actively detect and reject embedded browsers |
| `__session` cookie is HttpOnly                | Can't set from JavaScript                                 |
| No `initialToken` prop in ClerkProvider       | Can't pass token from Go                                  |
| `setActive()` requires existing Clerk session | External tokens not recognized                            |

**Conclusion:** Must use custom auth context for desktop, not Clerk React SDK.

## 3.2 Architecture Split

| Layer              | Responsibility                                                        |
| ------------------ | --------------------------------------------------------------------- |
| **Go Backend**     | OAuth flow, system browser, deep link, token exchange, secure storage |
| **React Frontend** | Custom auth context, auth state, API calls with token                 |

## 3.3 Why System Browser is Required

OAuth providers (Google, etc.) block embedded webviews:

| Issue                     | Why                                 |
| ------------------------- | ----------------------------------- |
| `X-Requested-With` header | Webviews leak app identity          |
| Session isolation         | Can't use existing browser login    |
| Security policy           | Providers explicitly block webviews |
| User trust                | Users can't verify real auth page   |

**Solution:** Open auth in system browser, return via deep link.

## 3.4 Sign-In Flow (Go Handles)

```
User clicks "Login" (React)
    ↓
React calls Go: StartOAuth()
    ↓
Go generates PKCE challenge + state token
    ↓
Go opens system browser with OAuth URL
    ↓
User authenticates in browser
    ↓
Browser redirects to: myapp://callback?code=XXX&state=YYY
    ↓
OS routes deep link to Wails app
    ↓
Go catches callback, validates state
    ↓
Go exchanges code for tokens (Clerk API)
    ↓
Go stores session_id in keychain, JWT in memory
    ↓
Go emits event to React: "auth complete"
    ↓
React updates auth state
```

## 3.5 PKCE Parameters

| Parameter               | Purpose                                             |
| ----------------------- | --------------------------------------------------- |
| `code_verifier`         | Random 43-128 char string (kept secret in Go)       |
| `code_challenge`        | `base64url(sha256(code_verifier))` sent in auth URL |
| `code_challenge_method` | `S256`                                              |

**Token exchange:** Send `code_verifier` to prove you initiated the request.

## 3.6 After Sign-In (React Handles)

Once signed in, auth lives in React:

| Concern          | How                                    |
| ---------------- | -------------------------------------- |
| Auth state       | Custom `AuthContext`                   |
| Check signed in  | `const { isSignedIn } = useAuth()`     |
| API calls        | Attach `Authorization: Bearer {token}` |
| Protected routes | `if (!isSignedIn) redirect`            |
| Sign out         | Clear tokens, reset state              |

## 3.7 Custom Auth Context Pattern

```
AuthContext provides:
- token: string | null
- user: { id, email, name } | null
- isSignedIn: boolean
- isLoading: boolean
- getToken: () => Promise<string>  ← handles refresh
- signOut: () => void
```

**Same interface as Clerk's `useAuth()`** - easy to swap implementations.

## 3.8 Token Storage

| Token      | Storage                 | Lifetime            |
| ---------- | ----------------------- | ------------------- |
| Session ID | Go keychain (encrypted) | Long (7-30 days)    |
| JWT        | React memory            | Short (~60 seconds) |

**Platform keystores:**

- macOS: Keychain
- Windows: DPAPI
- Linux: gnome-keyring

## 3.9 Token Refresh (Manual)

**Key Discovery:** Clerk SDK auto-refreshes. Desktop must do it manually.

**How Clerk tokens work:**

| Token   | Lifetime            | Notes                         |
| ------- | ------------------- | ----------------------------- |
| Session | Long (7-30 days)    | Configured in Clerk Dashboard |
| JWT     | Short (~60 seconds) | Derived from session          |

**Refresh flow:**

```
API call needed
    ↓
Check JWT expiry (decode, check `exp` claim)
    ↓
If expired: React calls Go.RefreshToken(sessionId)
    ↓
Go calls Clerk API: POST /v1/sessions/{session_id}/tokens
    ↓
Clerk returns fresh JWT
    ↓
Go returns JWT to React
    ↓
React uses fresh JWT for API call
```

**Clerk API for refresh:**

```
POST https://api.clerk.com/v1/sessions/{session_id}/tokens
Authorization: Bearer {CLERK_SECRET_KEY}

Returns: { jwt: "fresh_token", expires_at: timestamp }
```

## 3.10 Token Manager Pattern

```
TokenManager:
- jwt: current JWT (short-lived)
- sessionId: from keychain (long-lived)
- expiresAt: JWT expiry timestamp

getToken():
  if jwt not expired (with 30s buffer):
    return jwt
  else:
    call Go.RefreshToken(sessionId)
    update jwt + expiresAt
    return new jwt
```

---

# Part 4: Platform Comparison Summary

## 4.1 Auth Approach by Platform

| Platform        | Sign In             | Session        | Token Refresh | SDK                       |
| --------------- | ------------------- | -------------- | ------------- | ------------------------- |
| Web Dashboard   | Clerk UI            | Clerk manages  | Automatic     | `@clerk/clerk-react`      |
| Web Participant | Clerk UI            | Clerk manages  | Automatic     | `@clerk/clerk-react`      |
| Wails Desktop   | System browser + Go | Custom context | Manual via Go | Custom + `@clerk/backend` |

## 4.2 What Each Layer Handles

| Layer              | Web                 | Desktop                       |
| ------------------ | ------------------- | ----------------------------- |
| Sign in UI         | Clerk `<SignIn>`    | System browser                |
| Session storage    | Clerk (cookie)      | Go keychain                   |
| Auth state         | `useAuth()`         | Custom `useAuth()`            |
| Token for API      | `getToken()` (auto) | `getToken()` (manual refresh) |
| Token verification | `@clerk/backend`    | `@clerk/backend`              |

## 4.3 API Doesn't Care

The backend (Hono API) verifies JWTs identically regardless of source:

```
Web token      ─┐
                ├──→ @clerk/backend.authenticateRequest() ──→ Valid/Invalid
Desktop token ─┘
```

Same verification, same `@clerk/backend`, same result.

---

# Part 5: Key Decisions Summary

| Decision              | Choice                     | Rationale                        |
| --------------------- | -------------------------- | -------------------------------- |
| Backend SDK           | `@clerk/backend` (manual)  | Full control, official package   |
| Community Hono lib    | Skip                       | Don't want community dependency  |
| JWT verification      | Networkless                | Zero latency, faster cold starts |
| Web auth              | Full Clerk React SDK       | Best UX, automatic everything    |
| Desktop auth          | Custom context + Go        | Clerk SDK won't work in webview  |
| Desktop sign-in       | System browser + deep link | OAuth providers block webviews   |
| Desktop token storage | Go keychain                | Secure, OS-protected             |
| Desktop token refresh | Manual via Clerk API       | SDK not available                |

---

## References

- Clerk Backend SDK: https://clerk.com/docs/references/backend/overview
- Clerk JWT verification: https://clerk.com/docs/backend-requests/handling/manual-jwt
- Clerk React SDK: https://clerk.com/docs/references/react/overview
- Clerk Session Tokens API: https://clerk.com/docs/reference/backend-api/tag/Sessions
- Hono middleware: https://hono.dev/docs/guides/middleware
- Hono Cloudflare: https://hono.dev/docs/getting-started/cloudflare-workers
- RFC 8252: OAuth 2.0 for Native Applications
- Wails runtime: https://wails.io/docs/reference/runtime/intro
