# Clerk TOS/Privacy Policy Consent Research

## Executive Summary

Clerk provides **limited built-in TOS/privacy consent features**. While Clerk has a "Legal compliance" setting that can add a checkbox, it's quite basic and designed for simple consent. For **PDPA compliance in Thailand**, you'll likely need a **custom implementation** using Clerk's metadata and onboarding features.

---

## 1. Clerk TOS/Privacy Features

### 1.1 Built-in Consent Feature

**Clerk DOES support a basic legal consent checkbox:**

- **Feature**: "Require express consent to legal documents" toggle in Clerk Dashboard
- **Location**: Dashboard → **Legal** page → Enable **Require express consent to legal documents**
- **Result**: Adds checkbox to `<SignUp />` component and Account Portal sign-up
- **Timing**: Checkbox appears **during sign-up flow**, **before account creation** (user must check to proceed)

### 1.2 Configuration Steps

1. Navigate to [Legal page](https://dashboard.clerk.com/~/compliance/legal)
2. Enable **Require express consent to legal documents**
3. Checkbox automatically appears in SignUp component

### 1.3 Customization Limitations

**Built-in feature limitations:**

- ✅ Can customize the checkbox text
- ✅ Can add custom legal text (via appearance prop)
- ❌ **Cannot add multiple separate consent checkboxes** (PDPA + TOS + Privacy as separate items)
- ❌ **Cannot add custom links** to TOS/privacy policy documents
- ❌ **Cannot track separate timestamps** for different consent types
- ❌ **Cannot require re-consent** when documents change

**From Clerk's `createUser()` API:**

- `legalAcceptedAt?: Date` - The date when the user accepted the legal documents. `null` if "Require express consent to legal documents" is not enabled.
- `skipLegalChecks?: boolean` - When set to `true` all legal checks are skipped. Recommended only for migrations.

### 1.4 Consent Storage

**Built-in storage:**

- Consent is stored in `legalAcceptedAt` field on User object
- Single timestamp - **cannot separate TOS vs PDPA consent**
- No built-in tracking of which version of documents were accepted
- Automatically stored when user checks the built-in checkbox

---

## 2. Clerk Metadata Integration

### 2.1 Types of Metadata

| Metadata    | Frontend Read | Frontend Write | Backend Read | Backend Write |
| ----------- | ------------- | -------------- | ------------ | ------------- |
| **Public**  | ✅            | ❌             | ✅           | ✅            |
| **Private** | ❌            | ❌             | ✅           | ✅            |
| **Unsafe**  | ✅            | ✅             | ✅           | ✅            |

### 2.2 For PDPA Consent - Which to Use?

**Recommendation: Use `public_metadata` for PDPA consent**

**Why public_metadata:**

- Can be read from session token (fast access, no API calls needed)
- Readable from frontend (useful for UI checks)
- Still only writable from backend (prevents user tampering)
- Size limit: 8KB (or 1.2KB if stored in session token)

**Why NOT private_metadata:**

- Cannot be accessed from frontend or session token
- Always requires backend API call (slower, rate limited)
- Better for sensitive data like Stripe customer ID

**Why NOT unsafe_metadata:**

- User can modify from frontend (security risk)
- Only use for temporary sign-up onboarding data

### 2.3 Metadata Configuration in Dashboard

**No dashboard configuration needed for metadata fields!**

Metadata is **schema-less** - you can store any JSON-compatible data:

```typescript
// Backend: Set PDPA consent
await clerkClient.users.updateUser(userId, {
  publicMetadata: {
    pdpaConsentAcceptedAt: new Date().toISOString(),
    pdpaConsentVersion: '1.0',
    tosConsentAcceptedAt: new Date().toISOString(),
    privacyPolicyConsentAcceptedAt: new Date().toISOString(),
  },
});

// Frontend: Access PDPA consent
const { user } = useUser();
const pdpaConsent = user?.publicMetadata?.pdpaConsentAcceptedAt;
```

### 2.4 Session Token Integration (Recommended)

To access metadata without API calls, add to session token:

1. Dashboard → **Sessions** → **Customize session token**
2. In **Claims** editor, add:
   ```json
   {
     "metadata": "{{user.public_metadata}}"
   }
   ```
3. Save

**TypeScript types:**

```typescript
// types/globals.d.ts
export {};

declare global {
  interface CustomJwtSessionClaims {
    metadata: {
      pdpaConsentAcceptedAt?: string;
      pdpaConsentVersion?: string;
      tosConsentAcceptedAt?: string;
      privacyPolicyConsentAcceptedAt?: string;
    };
  }
}
```

### 2.5 Automatic Metadata Setting

**No built-in automatic setting for custom metadata.**

You must set metadata via:

- Backend API call after user accepts consent
- Webhook handler on `user.created` event
- Server action called from custom consent form

**For built-in legal consent:**

- `legalAcceptedAt` is set automatically
- But it's a single timestamp, not separate for PDPA

---

## 3. Webhook Data

### 3.1 user.created Webhook Payload

**Exact webhook structure:**

```json
{
  "data": {
    "birthday": "",
    "created_at": 1654012591514,
    "email_addresses": [
      {
        "email_address": "example@example.org",
        "id": "idn_29w83yL7CwVlJXylYLxcslromF1",
        "linked_to": [],
        "object": "email_address",
        "verification": {
          "status": "verified",
          "strategy": "ticket"
        }
      }
    ],
    "external_accounts": [],
    "external_id": "567772",
    "first_name": "Example",
    "gender": "",
    "id": "user_29w83sxmDNGwOuEthce5gg56FcC",
    "image_url": "https://img.clerk.com/xxxxxx",
    "last_name": "Example",
    "last_sign_in_at": 1654012591514,
    "object": "user",
    "password_enabled": true,
    "phone_numbers": [],
    "primary_email_address_id": "idn_29w83yL7CwVlJXylYLxcslromF1",
    "primary_phone_number_id": null,
    "primary_web3_wallet_id": null,
    "private_metadata": {},
    "profile_image_url": "https://www.gravatar.com/avatar?d=mp",
    "public_metadata": {},
    "two_factor_enabled": false,
    "unsafe_metadata": {},
    "updated_at": 1654012591835,
    "username": null,
    "web3_wallets": []
  },
  "instance_id": "ins_123",
  "object": "event",
  "timestamp": 1654012591835,
  "type": "user.created"
}
```

### 3.2 Consent Status in Webhook

**Built-in legal consent:**

- `legalAcceptedAt` field is included in webhook payload
- **Only appears if** "Require express consent to legal documents" is enabled

**Custom metadata (PDPA):**

- `public_metadata` field includes your custom consent fields
- Example:
  ```json
  {
    "public_metadata": {
      "pdpaConsentAcceptedAt": "2026-01-27T10:30:00Z",
      "pdpaConsentVersion": "1.0",
      "tosConsentAcceptedAt": "2026-01-27T10:30:00Z",
      "privacyPolicyConsentAcceptedAt": "2026-01-27T10:30:00Z"
    }
  }
  ```

### 3.3 Setting Metadata Before Webhook

**Important timing consideration:**
If you set metadata immediately after user creation via API call, it **may or may not** be in the `user.created` webhook depending on timing.

**Better approaches:**

1. Use `user.updated` webhook to sync consent data
2. Handle consent in onboarding flow, then webhook will capture it
3. Sync data separately, don't rely on webhook timing

---

## 4. Enforcement Mechanisms

### 4.1 Built-in Enforcement

**With "Require express consent to legal documents" enabled:**

- User **cannot complete sign-up** without checking the box
- Clerk prevents account creation until checkbox is checked
- No custom logic needed

**Limitations:**

- Only one checkbox
- Cannot enforce multiple consent items
- Cannot require re-consent later

### 4.2 Custom Enforcement (Recommended for PDPA)

**Use Clerk's onboarding pattern:**

```typescript
// 1. Add consent to session token claims
// Dashboard → Sessions → Customize session token
{
  "metadata": "{{user.public_metadata}}"
}

// 2. Middleware to enforce consent
// middleware.ts (or proxy.ts for Next.js 15+)
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'

const isProtectedRoute = createRouteMatcher(['/dashboard(.*)'])

export default clerkMiddleware(async (auth, req) => {
  const { isAuthenticated, sessionClaims, redirectToSignIn } = await auth()

  // Require sign-in
  if (!isAuthenticated && isProtectedRoute(req)) {
    return redirectToSignIn({ returnBackUrl: req.url })
  }

  // Require PDPA consent
  if (isAuthenticated && !sessionClaims?.metadata?.pdpaConsentAcceptedAt) {
    const consentUrl = new URL('/consent', req.url)
    return NextResponse.redirect(consentUrl)
  }
})

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
}
```

### 4.3 Re-consent Requirements

**To require re-consent when TOS/privacy documents change:**

```typescript
// Track document versions
const CURRENT_PDPA_VERSION = "2.0"
const CURRENT_PRIVACY_VERSION = "1.5"

// Middleware check
if (sessionClaims?.metadata?.pdpaConsentVersion !== CURRENT_PDPA_VERSION) {
  const consentUrl = new URL('/consent', req.url)
  return NextResponse.redirect(consentUrl)
}

// Consent page
export default function ConsentPage() {
  const { user } = useUser()

  const acceptConsent = async () => {
    await fetch('/api/accept-consent', {
      method: 'POST',
      body: JSON.stringify({
        pdpaConsentVersion: CURRENT_PDPA_VERSION,
        privacyConsentVersion: CURRENT_PRIVACY_VERSION,
      }),
    })
    await user.reload() // Force token refresh
    router.push('/dashboard')
  }

  return (
    <div>
      <h1>Please accept our updated policies</h1>
      <p>PDPA Version {CURRENT_PDPA_VERSION}</p>
      <label>
        <input type="checkbox" required />
        I accept the PDPA consent terms
      </label>
      <button onClick={acceptConsent}>Continue</button>
    </div>
  )
}
```

### 4.4 Existing Users Without Consent

**Handle existing users via:**

1. **Bulk update via Backend API** (one-time migration):

   ```typescript
   // Admin script to backfill consent for existing users
   const users = await clerkClient.users.getUserList();
   for (const user of users.data) {
     await clerkClient.users.updateUser(user.id, {
       publicMetadata: {
         pdpaConsentAcceptedAt: user.createdAt, // Backdate to account creation
         pdpaConsentVersion: '1.0',
       },
     });
   }
   ```

2. **Gradual enforcement** - require consent on next login:
   - Add middleware that allows users without consent but prompts them
   - Show banner with link to consent page
   - Don't block access until they consent

3. ** grandfather clause** - treat old users differently:

   ```typescript
   const GRANDFATHER_CUTOFF = new Date('2026-02-01')

   if (!sessionClaims?.metadata?.pdpaConsentAcceptedAt &&
       user.createdAt < GRANDFATHER_CUTOFF) {
     // Show banner but don't block
     return <ConsentBanner />
   } else if (!sessionClaims?.metadata?.pdpaConsentAcceptedAt) {
     // Block new users
     return <ConsentModal />
   }
   ```

---

## 5. Customization Options

### 5.1 Built-in Checkbox Customization

**Via Appearance Prop:**

```typescript
import { ClerkProvider } from '@clerk/nextjs'

export default function RootLayout({ children }) {
  return (
    <ClerkProvider
      appearance={{
        layout: {
          termsPageUrl: 'https://yourapp.com/terms',
          privacyPageUrl: 'https://yourapp.com/privacy',
        },
        elements: {
          form: {
            primaryButton: {
              fontWeight: '600',
            },
          },
        },
      }}
    >
      {children}
    </ClerkProvider>
  )
}
```

**Limitations:**

- Can add links to TOS/privacy pages
- Can style the checkbox area
- **Cannot add multiple checkboxes**
- **Cannot add custom text above checkbox**

### 5.2 Custom Consent Form (Recommended)

**Build using Clerk's onboarding pattern:**

```typescript
// app/consent/page.tsx
'use client'

import { useUser } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import { acceptConsent } from './_actions'

export default function ConsentPage() {
  const { user } = useUser()
  const router = useRouter()
  const [consents, setConsents] = useState({
    pdpa: false,
    tos: false,
    privacy: false,
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const res = await acceptConsent(consents)

    if (res?.message) {
      await user?.reload() // Force token refresh
      router.push('/dashboard')
    }
    if (res?.error) {
      alert(res.error)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <h1>Required Consents</h1>

      <label>
        <input
          type="checkbox"
          checked={consents.pdpa}
          onChange={(e) => setConsents({ ...consents, pdpa: e.target.checked })}
          required
        />
        I accept the <a href="/pdpa" target="_blank">PDPA Terms</a>
      </label>

      <label>
        <input
          type="checkbox"
          checked={consents.tos}
          onChange={(e) => setConsents({ ...consents, tos: e.target.checked })}
          required
        />
        I accept the <a href="/terms" target="_blank">Terms of Service</a>
      </label>

      <label>
        <input
          type="checkbox"
          checked={consents.privacy}
          onChange={(e) => setConsents({ ...consents, privacy: e.target.checked })}
          required
        />
        I accept the <a href="/privacy" target="_blank">Privacy Policy</a>
      </label>

      <button type="submit">Continue</button>
    </form>
  )
}
```

**Server action:**

```typescript
// app/consent/_actions.ts
'use server';

import { auth, clerkClient } from '@clerk/nextjs/server';

export const acceptConsent = async (consents: {
  pdpa: boolean;
  tos: boolean;
  privacy: boolean;
}) => {
  const { isAuthenticated, userId } = await auth();

  if (!isAuthenticated) {
    return { error: 'No Logged In User' };
  }

  const client = await clerkClient();

  try {
    const now = new Date().toISOString();

    const res = await client.users.updateUser(userId, {
      publicMetadata: {
        pdpaConsentAcceptedAt: consents.pdpa ? now : undefined,
        pdpaConsentVersion: consents.pdpa ? '1.0' : undefined,
        tosConsentAcceptedAt: consents.tos ? now : undefined,
        tosConsentVersion: consents.tos ? '1.0' : undefined,
        privacyPolicyConsentAcceptedAt: consents.privacy ? now : undefined,
        privacyPolicyConsentVersion: consents.privacy ? '1.0' : undefined,
      },
    });

    return { message: 'Consent accepted' };
  } catch (err) {
    return { error: 'Failed to update consent' };
  }
};
```

### 5.3 Clerk Elements for Custom UI

**Clerk Elements (Beta - Not Recommended)**

Clerk Elements is deprecated and won't receive updates. For custom flows, use:

- Clerk API directly
- Custom onboarding pattern (recommended above)
- Prebuilt components with appearance customization

---

## 6. Best Practices

### 6.1 Recommended Approach for PDPA with Clerk

**Use Custom Onboarding + Metadata:**

1. **Do not enable** "Require express consent to legal documents" (too limited)
2. Use custom consent form with multiple checkboxes
3. Store consent timestamps in `public_metadata`
4. Add metadata to session token for fast access
5. Use middleware to enforce consent
6. Handle re-consent via version tracking

**Architecture:**

```
User Sign-Up
    ↓
Clerk Creates User Account
    ↓
Redirect to /consent (Middleware check)
    ↓
User checks all consent boxes
    ↓
Backend updates public_metadata
    ↓
Force token refresh (user.reload())
    ↓
Redirect to /dashboard
```

### 6.2 Syncing Consent Data

**Three approaches:**

**Option 1: Session Token Only (Recommended)**

- Store consent in `public_metadata`
- Add to session token claims
- Access via `sessionClaims.metadata`
- Fastest approach, no API calls needed

**Option 2: Webhook Sync**

- Use `user.created` and `user.updated` webhooks
- Sync consent data to your database
- Good if you need to query/filter users by consent status
- Remember: webhooks are eventual, not real-time

**Option 3: Hybrid**

- Use session token for fast access
- Use webhook for database sync (reporting, queries)
- Best of both worlds

**Webhook handler example:**

```typescript
// app/api/webhooks/route.ts
import { verifyWebhook } from '@clerk/nextjs/webhooks';

export async function POST(req: NextRequest) {
  try {
    const evt = await verifyWebhook(req);

    if (evt.type === 'user.created' || evt.type === 'user.updated') {
      const { id, public_metadata } = evt.data;

      // Sync to your database
      await db.users.upsert({
        clerkUserId: id,
        pdpaConsentAcceptedAt: public_metadata?.pdpaConsentAcceptedAt,
        tosConsentAcceptedAt: public_metadata?.tosConsentAcceptedAt,
        privacyConsentAcceptedAt: public_metadata?.privacyPolicyConsentAcceptedAt,
      });
    }

    return new Response('Webhook received', { status: 200 });
  } catch (err) {
    console.error('Error verifying webhook:', err);
    return new Response('Error verifying webhook', { status: 400 });
  }
}
```

### 6.3 Common Pitfalls

**Pitfall 1: Metadata not appearing in session token**

- **Problem**: Backend updates metadata but session still has old data
- **Solution**: Call `user.reload()` after metadata update or handle delay in app logic

**Pitfall 2: Webhook timing issues**

- **Problem**: Expecting `user.created` webhook to have metadata set immediately after sign-up
- **Solution**: Use `user.updated` webhook for metadata updates, or set metadata in onboarding before redirect

**Pitfall 3: Session token size overflow**

- **Problem**: Storing too much metadata in token (over 1.2KB limit)
- **Solution**: Store only essential consent data in token, extra data in database

**Pitfall 4: Relying on built-in consent for PDPA**

- **Problem**: Using Clerk's built-in checkbox doesn't meet PDPA requirements
- **Solution**: Build custom consent form with separate PDPA consent

**Pitfall 5: Not handling existing users**

- **Problem**: All existing users get blocked by new consent requirement
- **Solution**: Implement gradual rollout or grandfather clause

**Pitfall 6: Not tracking document versions**

- **Problem**: Can't require re-consent when PDPA/TOS changes
- **Solution**: Store version numbers alongside timestamps in metadata

### 6.4 Security Considerations

**Don't use unsafe_metadata for consent:**

- User can modify it from frontend
- Use `public_metadata` instead (backend-writable only)

**Validate consent timestamps:**

- Don't just check if field exists, validate it's a real date
- Check version numbers against current versions

**Backend verification:**

- Even with frontend checks, verify consent on backend for sensitive operations
- Use `auth()` helper in route handlers to check metadata

---

## 7. Recommendations for SAB-53

### 7.1 Recommended Implementation

```typescript
// Implementation Plan for SAB-53

// 1. Define consent versions and metadata schema
const CONSENT_CONFIG = {
  pdpa: {
    version: "1.0",
    url: "/legal/pdpa",
  },
  tos: {
    version: "1.0",
    url: "/legal/terms",
  },
  privacy: {
    version: "1.0",
    url: "/legal/privacy",
  },
}

// 2. Session token claims (Dashboard configuration)
{
  "metadata": "{{user.public_metadata}}"
}

// 3. TypeScript types
declare global {
  interface CustomJwtSessionClaims {
    metadata: {
      pdpaConsentAcceptedAt?: string
      pdpaConsentVersion?: string
      tosConsentAcceptedAt?: string
      tosConsentVersion?: string
      privacyPolicyConsentAcceptedAt?: string
      privacyPolicyConsentVersion?: string
      consentCompletedAt?: string
    }
  }
}

// 4. Middleware enforcement
// apps/dashboard/src/proxy.ts (or middleware.ts for Next.js <15)
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'

const isPublicRoute = createRouteMatcher(['/legal(.*)', '/consent'])
const isProtectedRoute = createRouteMatcher(['/dashboard(.*)'])

export default clerkMiddleware(async (auth, req) => {
  const { isAuthenticated, sessionClaims, redirectToSignIn } = await auth()

  // Allow public routes
  if (isPublicRoute(req)) {
    return NextResponse.next()
  }

  // Require sign-in
  if (!isAuthenticated && isProtectedRoute(req)) {
    return redirectToSignIn({ returnBackUrl: req.url })
  }

  // Require all consents to be completed
  if (isAuthenticated && isProtectedRoute(req)) {
    const metadata = sessionClaims?.metadata
    const hasAllConsents =
      metadata?.pdpaConsentAcceptedAt &&
      metadata?.pdpaConsentVersion === CONSENT_CONFIG.pdpa.version &&
      metadata?.tosConsentAcceptedAt &&
      metadata?.tosConsentVersion === CONSENT_CONFIG.tos.version &&
      metadata?.privacyPolicyConsentAcceptedAt &&
      metadata?.privacyPolicyConsentVersion === CONSENT_CONFIG.privacy.version

    if (!hasAllConsents) {
      const consentUrl = new URL('/consent', req.url)
      return NextResponse.redirect(consentUrl)
    }
  }

  return NextResponse.next()
})

// 5. Consent page with multiple checkboxes
// apps/dashboard/src/app/consent/page.tsx
'use client'

import { useUser } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import { acceptConsent } from './_actions'
import { CONSENT_CONFIG } from '@/lib/consent-config'

export default function ConsentPage() {
  const { user } = useUser()
  const router = useRouter()
  const [consents, setConsents] = useState({
    pdpa: false,
    tos: false,
    privacy: false,
  })
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    const res = await acceptConsent({
      pdpa: consents.pdpa,
      tos: consents.tos,
      privacy: consents.privacy,
      pdpaVersion: CONSENT_CONFIG.pdpa.version,
      tosVersion: CONSENT_CONFIG.tos.version,
      privacyVersion: CONSENT_CONFIG.privacy.version,
    })

    setIsSubmitting(false)

    if (res?.message) {
      await user?.reload() // Force token refresh
      router.push('/dashboard')
    }
    if (res?.error) {
      alert(res.error)
    }
  }

  return (
    <div className="max-w-2xl mx-auto p-8">
      <h1 className="text-3xl font-bold mb-6">Legal Consents</h1>
      <p className="mb-8">To use SabaiPics, please accept the following:</p>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* PDPA Consent */}
        <div className="flex items-start space-x-3">
          <input
            type="checkbox"
            id="pdpa"
            checked={consents.pdpa}
            onChange={(e) => setConsents({ ...consents, pdpa: e.target.checked })}
            required
            className="mt-1"
          />
          <label htmlFor="pdpa" className="flex-1">
            <span className="font-semibold">Personal Data Protection Act (PDPA)</span>
            <p className="text-sm text-gray-600 mt-1">
              Version {CONSENT_CONFIG.pdpa.version}.{' '}
              <a
                href={CONSENT_CONFIG.pdpa.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline"
              >
                Read PDPA Terms
              </a>
            </p>
          </label>
        </div>

        {/* TOS Consent */}
        <div className="flex items-start space-x-3">
          <input
            type="checkbox"
            id="tos"
            checked={consents.tos}
            onChange={(e) => setConsents({ ...consents, tos: e.target.checked })}
            required
            className="mt-1"
          />
          <label htmlFor="tos" className="flex-1">
            <span className="font-semibold">Terms of Service</span>
            <p className="text-sm text-gray-600 mt-1">
              Version {CONSENT_CONFIG.tos.version}.{' '}
              <a
                href={CONSENT_CONFIG.tos.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline"
              >
                Read Terms of Service
              </a>
            </p>
          </label>
        </div>

        {/* Privacy Policy Consent */}
        <div className="flex items-start space-x-3">
          <input
            type="checkbox"
            id="privacy"
            checked={consents.privacy}
            onChange={(e) => setConsents({ ...consents, privacy: e.target.checked })}
            required
            className="mt-1"
          />
          <label htmlFor="privacy" className="flex-1">
            <span className="font-semibold">Privacy Policy</span>
            <p className="text-sm text-gray-600 mt-1">
              Version {CONSENT_CONFIG.privacy.version}.{' '}
              <a
                href={CONSENT_CONFIG.privacy.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline"
              >
                Read Privacy Policy
              </a>
            </p>
          </label>
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full py-3 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {isSubmitting ? 'Processing...' : 'Continue to Dashboard'}
        </button>
      </form>
    </div>
  )
}

// 6. Server action to update consent
// apps/dashboard/src/app/consent/_actions.ts
'use server'

import { auth, clerkClient } from '@clerk/nextjs/server'

export const acceptConsent = async (params: {
  pdpa: boolean
  tos: boolean
  privacy: boolean
  pdpaVersion: string
  tosVersion: string
  privacyVersion: string
}) => {
  const { isAuthenticated, userId } = await auth()

  if (!isAuthenticated) {
    return { error: 'No Logged In User' }
  }

  const client = await clerkClient()

  try {
    const now = new Date().toISOString()

    const res = await client.users.updateUser(userId, {
      publicMetadata: {
        pdpaConsentAcceptedAt: params.pdpa ? now : undefined,
        pdpaConsentVersion: params.pdpa ? params.pdpaVersion : undefined,
        tosConsentAcceptedAt: params.tos ? now : undefined,
        tosConsentVersion: params.tos ? params.tosVersion : undefined,
        privacyPolicyConsentAcceptedAt: params.privacy ? now : undefined,
        privacyPolicyConsentVersion: params.privacy ? params.privacyVersion : undefined,
        consentCompletedAt: (params.pdpa && params.tos && params.privacy) ? now : undefined,
      },
    })

    return { message: 'Consent accepted', user: res }
  } catch (err) {
    console.error('Consent update error:', err)
    return { error: 'Failed to update consent' }
  }
}

// 7. Optional: Webhook to sync consent to database
// apps/api/src/routes/webhooks/route.ts
import { verifyWebhook } from '@clerk/nextjs/webhooks'

export async function POST(req: Request) {
  try {
    const evt = await verifyWebhook(req)

    if (evt.type === 'user.created' || evt.type === 'user.updated') {
      const { id, public_metadata } = evt.data

      // Sync to your database (e.g., Cloudflare D1)
      const db = env.DB

      await db.prepare(`
        INSERT INTO users (clerk_user_id, pdpa_consent_at, tos_consent_at, privacy_consent_at, consent_completed_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(clerk_user_id) DO UPDATE SET
          pdpa_consent_at = excluded.pdap_consent_at,
          tos_consent_at = excluded.tos_consent_at,
          privacy_consent_at = excluded.privacy_consent_at,
          consent_completed_at = excluded.consent_completed_at
      `).bind(
        id,
        public_metadata?.pdpaConsentAcceptedAt,
        public_metadata?.tosConsentAcceptedAt,
        public_metadata?.privacyPolicyConsentAcceptedAt,
        public_metadata?.consentCompletedAt,
      ).run()
    }

    return new Response('Webhook received', { status: 200 })
  } catch (err) {
    console.error('Error verifying webhook:', err)
    return new Response('Error verifying webhook', { status: 400 })
  }
}
```

### 7.2 Implementation Checklist

- [ ] Clerk Dashboard: **DO NOT** enable "Require express consent to legal documents"
- [ ] Clerk Dashboard: Sessions → Add `metadata` to session token claims
- [ ] Create `CONSENT_CONFIG` with version numbers and URLs
- [ ] Add TypeScript types for `CustomJwtSessionClaims`
- [ ] Create middleware with consent enforcement logic
- [ ] Create `/consent` page with multiple consent checkboxes
- [ ] Create server action to update user metadata
- [ ] Add legal document pages (`/legal/pdpa`, `/legal/terms`, `/legal/privacy`)
- [ ] Set up `user.created` and `user.updated` webhooks (optional, for DB sync)
- [ ] Test consent flow end-to-end
- [ ] Test re-consent requirement (update version numbers)
- [ ] Test token refresh (`user.reload()`)
- [ ] Plan migration strategy for existing users

### 7.3 Legal Document Pages

Create detailed legal document pages:

```typescript
// apps/dashboard/src/app/legal/pdpa/page.tsx
export default function PDPAPage() {
  return (
    <article className="prose max-w-3xl mx-auto p-8">
      <h1>Personal Data Protection Act (PDPA) Consent</h1>
      <p>Version 1.0 - Effective January 27, 2026</p>
      {/* Detailed PDPA text */}
    </article>
  )
}

// apps/dashboard/src/app/legal/terms/page.tsx
export default function TermsPage() {
  return (
    <article className="prose max-w-3xl mx-auto p-8">
      <h1>Terms of Service</h1>
      <p>Version 1.0 - Effective January 27, 2026</p>
      {/* Detailed TOS text */}
    </article>
  )
}

// apps/dashboard/src/app/legal/privacy/page.tsx
export default function PrivacyPage() {
  return (
    <article className="prose max-w-3xl mx-auto p-8">
      <h1>Privacy Policy</h1>
      <p>Version 1.0 - Effective January 27, 2026</p>
      {/* Detailed privacy policy text */}
    </article>
  )
}
```

---

## Summary

| Feature                | Built-in                   | Custom Implementation        |
| ---------------------- | -------------------------- | ---------------------------- |
| TOS checkbox           | ✅ (single only)           | ✅ (multiple)                |
| PDPA checkbox          | ❌                         | ✅                           |
| Privacy checkbox       | ❌                         | ✅                           |
| Custom links           | Limited                    | ✅ (full control)            |
| Version tracking       | ❌                         | ✅                           |
| Re-consent requirement | ❌                         | ✅                           |
| Metadata storage       | `legalAcceptedAt` (single) | `public_metadata` (flexible) |
| Webhook support        | ✅                         | ✅                           |
| Session token access   | ✅                         | ✅                           |
| Enforcement            | ✅ (built-in)              | ✅ (custom middleware)       |

**Recommendation: Use custom implementation for SAB-53.**

Clerk's built-in legal compliance feature is designed for simple use cases. For PDPA compliance in Thailand with separate consent tracking, version management, and re-consent requirements, a **custom onboarding flow using metadata** provides the flexibility needed.

---

## References

- [Clerk Legal Compliance Docs](https://clerk.com/docs/guides/secure/legal-compliance)
- [Clerk Metadata Docs](https://clerk.com/docs/guides/users/extending)
- [Clerk Webhooks Docs](https://clerk.com/docs/guides/development/webhooks/overview)
- [Clerk Onboarding Flow](https://clerk.com/docs/guides/development/add-onboarding-flow)
- [Clerk Session Tokens](https://clerk.com/docs/guides/sessions/session-tokens)
- [Clerk Appearance Prop](https://clerk.com/docs/nextjs/guides/customizing-clerk/appearance-prop/overview)
- [Clerk createUser API](https://clerk.com/docs/reference/backend/user/create-user)
- [Clerk Session Tasks](https://clerk.com/docs/guides/configure/session-tasks)
