# Clerk Auth Integration

## Architecture

- `packages/auth` - Shared auth types, errors, and Hono middleware factory
- `apps/api` - Uses `@sabaipics/auth` middleware with method chaining for RPC type inference
- `apps/dashboard` - Uses `@sabaipics/auth/react` (wraps `@clerk/clerk-react`)

---

## packages/auth Structure

```
packages/auth/
├── src/
│   ├── types.ts       # AuthObject, AuthBindings, AuthVariables
│   ├── errors.ts      # AUTH_ERRORS enum, createAuthError()
│   ├── middleware.ts  # createClerkAuth(), requireAuth(), requirePhotographer()
│   ├── provider.tsx   # AuthProvider (wraps ClerkProvider)
│   ├── components.tsx # SignIn, SignUp, UserButton, SignedIn, SignedOut
│   ├── hooks.ts       # useAuth(), useUser()
│   └── react.ts       # React exports barrel
└── package.json
```

**Exports:**
- `@sabaipics/auth/middleware` - Server-side (Hono)
- `@sabaipics/auth/react` - Client-side (React)
- `@sabaipics/auth/types` - Shared types
- `@sabaipics/auth/errors` - Error utilities

---

## Hono RPC Type Inference Pattern

```typescript
// Method chaining required for type inference
const app = new Hono<{ Bindings; Variables }>()
  .use('/*', cors())
  .use('/*', createClerkAuth())
  .get('/', handler)
  .route('/auth', authRouter)

export type AppType = typeof app  // Captures full router type
```

---

## Networkless JWT Verification

Uses `createClerkClient` + `authenticateRequest` for edge-compatible auth.

**Required Keys:**
- `CLERK_SECRET_KEY` - For creating Clerk client
- `CLERK_PUBLISHABLE_KEY` - For creating Clerk client
- `CLERK_JWT_KEY` - PEM public key for networkless verification

**JWT Key Format:**
```bash
# Single line with \n escapes
CLERK_JWT_KEY="-----BEGIN PUBLIC KEY-----\nMIIBIjANBg...\n-----END PUBLIC KEY-----"
```

---

## Webhook Integration

Clerk webhooks sync user data to database.

**Events:**
- `user.created` - Create photographer/participant record
- `user.updated` - Sync profile changes
- `user.deleted` - Soft delete user record

**Endpoint:** `/webhooks/clerk`

**Route Order (IMPORTANT):**
```typescript
const app = new Hono()
  .route("/webhooks", webhookRouter)  // First - no auth
  .use("/*", cors())                   // Then CORS
  .use("/*", createClerkAuth())        // Then auth
  .route("/auth", authRouter);
```

**Svix Verification:**
```typescript
const wh = new Webhook(secret);
const event = wh.verify(body, {
  "svix-id": headers.get("svix-id"),
  "svix-timestamp": headers.get("svix-timestamp"),
  "svix-signature": headers.get("svix-signature"),
});
```

---

## Dev Tunnel Script

`apps/api/scripts/dev-tunnel.js` starts wrangler + ngrok together.

**Usage:**
```bash
pnpm dev              # API + dashboard + ngrok tunnel
pnpm --filter=@sabaipics/api dev:local  # API only, no tunnel
```

**Config:** Set `NGROK_DOMAIN` in `.dev.vars`

---

## Auth Abstraction Pattern

Only `packages/auth` imports from `@clerk/*`. Apps import from `@sabaipics/auth`.

```typescript
// Before (tightly coupled)
import { ClerkProvider, useAuth } from "@clerk/clerk-react";

// After (abstracted)
import { AuthProvider, useAuth } from "@sabaipics/auth/react";
```

**Benefits:**
- Single source of truth for Clerk
- Can swap auth providers without changing app code
- Clean React/server boundaries

---

## Docs

- https://clerk.com/docs/quickstarts/react
- https://clerk.com/docs/reference/backend/authenticate-request#networkless-token-verification
- https://clerk.com/docs/deployments/cloudflare
- https://hono.dev/docs/guides/rpc
