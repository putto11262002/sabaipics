# Auth Integration Patterns

**Status:** Complete
**Last Updated:** 2025-12-06

---

## Overview

This document covers HOW to integrate Clerk authentication across all platforms. For WHAT we're building (user types, auth requirements, flows), see primary docs.

**Provider:** Clerk (handles all auth - LINE, Google, Email OTP)

---

## Critical Decision 1: Platform Auth Strategy

| Platform | Approach | Why |
|----------|----------|-----|
| **Web (Dashboard)** | Full `@clerk/clerk-react` SDK | Best UX, automatic token refresh |
| **Web (Participant)** | Full `@clerk/clerk-react` SDK | Same as dashboard |
| **Wails Desktop** | Custom auth context + Go OAuth | Clerk SDK won't work in webview |
| **Hono API** | `@clerk/backend` (manual) | Full control, networkless verification |

**Why NOT use community `clerk-hono` library?**
- We want full control over middleware
- Official `@clerk/backend` is maintained by Clerk
- No dependency on community maintenance

---

## Critical Decision 2: Why Desktop Can't Use Clerk SDK

| Issue | Explanation |
|-------|-------------|
| OAuth providers block webviews | Google, LINE actively detect and reject embedded browsers |
| `__session` cookie is HttpOnly | Can't set from JavaScript after Go OAuth |
| No `initialToken` prop in ClerkProvider | Can't initialize Clerk with external token |
| `setActive()` requires existing session | Tokens from Go not recognized by Clerk SDK |

**Conclusion:** Desktop uses custom auth context, web uses full Clerk SDK.

---

## Critical Decision 3: Token Verification Strategy

**Networkless verification** - no network calls during JWT verification.

| Approach | Latency | Use |
|----------|---------|-----|
| Network (fetch JWKS) | +50-200ms per request | ❌ Don't use |
| **Networkless (cached key)** | ~0ms | ✅ Use this |

**How it works:**
1. Get JWKS Public Key from Clerk Dashboard → API Keys
2. Store in Cloudflare Secrets as `CLERK_JWT_KEY`
3. Pass to client: `createClerkClient({ jwtKey: env.CLERK_JWT_KEY })`
4. JWT signature verified locally, no network call

---

## Critical Decision 4: Environment Variables

| Variable | Purpose | Storage |
|----------|---------|---------|
| `CLERK_PUBLISHABLE_KEY` | Frontend initialization | `.env` (public) |
| `CLERK_SECRET_KEY` | Clerk API calls, token refresh | Cloudflare Secrets |
| `CLERK_JWT_KEY` | Networkless JWT verification | Cloudflare Secrets |

---

## Critical Decision 5: Authorized Parties

Validates the `azp` (authorized party) JWT claim - prevents tokens from other apps.

| Environment | Authorized Parties |
|-------------|-------------------|
| Production | `https://app.facelink.co`, `https://get.facelink.co` |
| Desktop | App-specific (configured in Clerk) |
| Development | `http://localhost:3000`, `http://localhost:5173` |

---

# Integration Patterns

## Pattern 1: React Web (Dashboard + Participant)

### Setup

| Step | What |
|------|------|
| 1 | Wrap app with `<ClerkProvider publishableKey={...}>` |
| 2 | Use hooks for auth state |
| 3 | Use components for UI |

### Key Hooks

| Hook | Returns | Use For |
|------|---------|---------|
| `useAuth()` | `{ getToken, isSignedIn, userId, signOut }` | Auth state, API calls |
| `useUser()` | `{ user, isLoaded }` | User details (name, email, avatar) |

### Key Components

| Component | Purpose |
|-----------|---------|
| `<SignedIn>` | Render children only when authenticated |
| `<SignedOut>` | Render children only when NOT authenticated |
| `<SignIn>` | Full sign-in form (handles all auth methods) |
| `<UserButton>` | Avatar with dropdown menu |

### API Calls

| Request Type | Token Handling |
|--------------|----------------|
| Same-origin | Automatic (cookie) |
| Cross-origin | Manual `Authorization: Bearer {token}` header |

**Cross-origin pattern:**
```
1. const { getToken } = useAuth()
2. const token = await getToken()
3. fetch(url, { headers: { Authorization: `Bearer ${token}` } })
```

**Token refresh:** Automatic - `getToken()` always returns valid token.

---

## Pattern 2: Hono API (Cloudflare Workers)

### Middleware Composition

| Middleware | Behavior | Use |
|------------|----------|-----|
| `authMiddleware` | Verifies token, sets context, allows unauthenticated | All routes |
| `requireAuth` | Returns 401 if no auth | Protected routes |
| `requirePhotographer` | Returns 403 if not photographer | Photographer routes |

**Pattern:** Base middleware extracts + sets context. Route-specific middleware enforces requirements.

### Verification Flow

| Step | What |
|------|------|
| 1 | Extract `Authorization: Bearer {token}` header |
| 2 | Create Clerk client with `secretKey` + `jwtKey` |
| 3 | Call `authenticateRequest(request, { authorizedParties, jwtKey })` |
| 4 | Get auth object: `requestState.toAuth()` |
| 5 | Set context: `c.set('auth', auth)` |
| 6 | Call `next()` |

### Auth Object Contents

| Field | Type | Description |
|-------|------|-------------|
| `userId` | `string \| null` | Clerk user ID |
| `sessionId` | `string \| null` | Current session ID |

### Error Responses

| Scenario | Status | Error Code |
|----------|--------|------------|
| No Authorization header | 401 | `NO_AUTH` |
| Invalid token format | 400 | `INVALID_FORMAT` |
| Expired token | 401 | `TOKEN_EXPIRED` |
| Invalid signature | 401 | `INVALID_TOKEN` |
| Wrong `azp` claim | 403 | `FORBIDDEN` |

---

## Pattern 3: Wails Desktop

### Architecture Split

| Layer | Responsibility |
|-------|----------------|
| **Go Backend** | OAuth flow, system browser, deep link, token exchange, secure storage, token refresh |
| **React Frontend** | Custom auth context, auth state, UI, API calls with token |

### Why System Browser (Not Webview)?

OAuth providers block embedded webviews:

| Issue | Why |
|-------|-----|
| `X-Requested-With` header | Webviews leak app identity |
| Session isolation | Can't use existing browser login |
| Security policy | Providers explicitly block |
| User trust | Users can't verify real auth page |

### Sign-In Flow

| Step | What | Where |
|------|------|-------|
| 1 | User clicks "Login" | React |
| 2 | Generate PKCE challenge + state token | Go |
| 3 | Open system browser with OAuth URL | Go |
| 4 | User authenticates | System browser |
| 5 | Browser redirects to `myapp://callback?code=...` | Browser |
| 6 | OS routes deep link to app | OS |
| 7 | Catch callback, validate state | Go |
| 8 | Exchange code for tokens (Clerk API) | Go |
| 9 | Store session_id in keychain | Go |
| 10 | Emit event to React | Go |
| 11 | Update auth state | React |

### PKCE Parameters

| Parameter | Purpose |
|-----------|---------|
| `code_verifier` | Random 43-128 char string (kept secret in Go) |
| `code_challenge` | `base64url(sha256(code_verifier))` sent in auth URL |
| `code_challenge_method` | `S256` |

### After Sign-In (React Handles)

Once signed in, auth lives in React:

| Concern | How |
|---------|-----|
| Auth state | Custom `AuthContext` |
| Check signed in | `const { isSignedIn } = useAuth()` |
| API calls | Attach `Authorization: Bearer {token}` |
| Protected routes | `if (!isSignedIn) redirect` |
| Sign out | Clear tokens, call Go to clear keychain |

### Custom Auth Context Interface

```
AuthContext provides:
- token: string | null
- user: { id, email, name } | null
- isSignedIn: boolean
- isLoading: boolean
- getToken: () => Promise<string>  ← handles refresh
- signOut: () => void
```

**Same interface as Clerk's `useAuth()`** - consistent across platforms.

### Token Storage

| Token | Storage | Lifetime |
|-------|---------|----------|
| Session ID | Go keychain (encrypted) | Long (7-30 days) |
| JWT | React memory | Short (~60 seconds) |

**Platform keystores:**
- macOS: Keychain
- Windows: DPAPI
- Linux: gnome-keyring

### Token Refresh (Desktop Only)

**Key difference:** Clerk SDK auto-refreshes. Desktop must do it manually.

**How Clerk tokens work:**

| Token | Lifetime | Notes |
|-------|----------|-------|
| Session | Long (7-30 days) | Configured in Clerk Dashboard |
| JWT | Short (~60 seconds) | Derived from session |

**Refresh flow:**

| Step | What | Where |
|------|------|-------|
| 1 | API call needed | React |
| 2 | Check JWT expiry (`exp` claim with 30s buffer) | React |
| 3 | If expired: call `Go.RefreshToken(sessionId)` | React → Go |
| 4 | Call Clerk API: `POST /v1/sessions/{id}/tokens` | Go |
| 5 | Return fresh JWT | Go → React |
| 6 | Use fresh JWT for API call | React |

**Clerk API endpoint for refresh:**
```
POST https://api.clerk.com/v1/sessions/{session_id}/tokens
Authorization: Bearer {CLERK_SECRET_KEY}
```

### Token Manager Pattern

```
TokenManager (React):
- jwt: current JWT (short-lived)
- sessionId: from Go keychain (long-lived)
- expiresAt: JWT expiry timestamp

getToken():
  if jwt valid (with 30s buffer):
    return jwt
  else:
    jwt = await Go.RefreshToken(sessionId)
    update expiresAt
    return jwt
```

---

## Pattern 4: Webhook Handling

### Events We Handle

| Event | Action |
|-------|--------|
| `user.created` | Create `photographers` or `participants` record |
| `user.updated` | Sync profile changes |
| `user.deleted` | Soft delete user record |

### User Type Determination

| Sign-up Source | User Type |
|----------------|-----------|
| Dashboard (`app.facelink.co`) | Photographer |
| Participant web (`get.facelink.co`) | Participant |

**Mechanism:** Pass `user_type` in Clerk signup metadata.

### Webhook Verification

| Step | What |
|------|------|
| 1 | Extract `svix-signature` header |
| 2 | Get raw request body |
| 3 | Verify with `CLERK_WEBHOOK_SECRET` |
| 4 | Reject if invalid |

**See:** `08_security.md` Critical Decision 6 for verification details.

---

## Pattern 5: LINE Login + OA Friend

### Two Requirements for LINE Push

| Requirement | How We Get It |
|-------------|---------------|
| `line_user_id` | Clerk LINE Login (stored in Clerk external accounts) |
| `line_linked = TRUE` | User added OA as friend |

### Getting OA Friend Status

**During LINE Login:**
- Clerk uses `bot_prompt=aggressive` parameter
- Consent screen shows "Add friend" checkbox
- Callback includes `friendship_status_changed` if they added

**Via Webhooks:**
- `follow` event → set `line_linked = TRUE`
- `unfollow` event → set `line_linked = FALSE`

**See:** `06_line_messaging.md` for LINE integration details.

---

## Platform Comparison Summary

| Aspect | Web | Desktop |
|--------|-----|---------|
| Sign in UI | Clerk `<SignIn>` | System browser |
| Session storage | Clerk (cookie) | Go keychain |
| Auth state | Clerk `useAuth()` | Custom `useAuth()` |
| Token for API | `getToken()` (auto refresh) | `getToken()` (manual refresh) |
| Token verification | `@clerk/backend` | `@clerk/backend` |

**API doesn't care** - verifies JWTs identically regardless of token source.

---

## Session Configuration

| Platform | Duration | Configured In |
|----------|----------|---------------|
| Web | 7 days | Clerk Dashboard |
| Desktop | 30 days | Clerk Dashboard |

---

## What's NOT in This Doc

- User types and auth methods (see `00_use_cases.md`)
- Permission model details (see `00_business_rules.md`)
- Auth flows diagrams (see `00_flows.md`)
- LINE messaging patterns (see `06_line_messaging.md`)

---

## References

- `dev/research/clerk_hono_integration.md` - Complete Clerk integration research
- `dev/tech/00_use_cases.md` - Auth requirements per use case
- `dev/tech/00_flows.md` - Auth flows (#1, #8)
- `dev/tech/06_line_messaging.md` - LINE push requirements
- `dev/tech/08_security.md` - Webhook verification
