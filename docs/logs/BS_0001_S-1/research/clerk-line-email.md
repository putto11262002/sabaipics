# Research: Clerk + LINE OAuth Email Requirements

**RootId:** BS_0001_S-1
**Topic:** clerk-line-email
**Date:** 2026-01-09
**Constraint:** US-1 requires photographer signup via Google, LINE, or email; we MUST have user's email for all photographers.

---

## Executive Summary

LINE OAuth **does not provide email by default**. Email access requires a special application to LINE and user consent. Clerk supports LINE as a social provider and has a built-in mechanism to collect missing required fields (like email) after OAuth flow completes. **Recommended approach:** Configure Clerk to require email, apply for LINE email permission, and implement a fallback flow for users who don't grant email permission.

---

## Research Findings

### 1. Does LINE OAuth Provide Email by Default?

**Answer: No.** LINE OAuth does not provide email by default.

From [LINE Login documentation](https://developers.line.biz/en/docs/line-login/integrate-line-login/):

| Scope | Profile | ID Token | Display Name | Profile Image | Email |
|-------|---------|----------|--------------|---------------|-------|
| `profile` | Yes | - | - | - | - |
| `profile openid` | Yes | Yes | Yes | Yes | - |
| `profile openid email` | Yes | Yes | Yes | Yes | Yes (see note) |
| `openid` | - | Yes | - | - | - |
| `openid email` | - | Yes | - | - | Yes (see note) |

**Critical Note from LINE Documentation:**
> "Before you can specify the `email` scope and ask the user for permission to obtain their email address, you must first **submit an application requesting access to users' email addresses**."

Additionally:
- Even with email scope enabled, users can **decline to share their email**
- The consent screen may not always show for returning users
- Email is returned in the ID token, not the profile API

### 2. Can Clerk Be Configured to Require Email for LINE Signups?

**Answer: Yes, via Clerk's "required fields" mechanism.**

Clerk handles this through its sign-up configuration:

1. **Clerk Dashboard > User & Authentication > Email**
   - Enable "Sign-up with email"
   - Enable "Verify at sign-up"

2. **Missing Requirements Flow:**
   When an OAuth provider (like LINE) doesn't provide a required field (email), Clerk:
   - Returns `SignUp.status = "missing_requirements"`
   - Populates `SignUp.missingFields` array with required fields
   - Allows you to build a "Continue" page to collect missing data

From [Clerk OAuth documentation](https://clerk.com/docs/guides/development/custom-flows/authentication/oauth-connections):
> "With OAuth flows, it's common for users to try to sign in with an OAuth provider, but they don't have a Clerk account for your app yet. Clerk automatically transfers the flow from the `SignIn` object to the `SignUp` object, which returns the `"missing_requirements"` status and `missingFields` array needed to handle the missing requirements flow."

### 3. If LINE Doesn't Provide Email, Does Clerk Prompt User to Enter One?

**Answer: Depends on your implementation.**

- **With prebuilt components (`<SignUp />`, `<SignIn />`):** Clerk's prebuilt UI will automatically show fields for missing requirements
- **With custom flows:** You must handle the `missing_requirements` status and render a form to collect the email

The flow works as follows:
1. User clicks "Sign in with LINE"
2. LINE OAuth completes (possibly without email)
3. Clerk returns `status: "missing_requirements"` with `missingFields: ["email_address"]`
4. Your app shows a form asking for email
5. User enters email -> Clerk sends verification code/link
6. User verifies email -> Sign-up completes

### 4. What's the Recommended Clerk Configuration for "Always Require Email"?

**Recommended Configuration:**

#### Step 1: Clerk Dashboard Settings
```
Dashboard > User & Authentication > Email
- [x] Sign-up with email (Required)
- [x] Verify at sign-up (Enable)
- [x] Email verification code (or Email verification link)
```

#### Step 2: LINE Developer Console Settings
1. Apply for email permission at [LINE Developers Console](https://developers.line.biz/console/)
2. Navigate to your LINE Login channel
3. Under "OpenID Connect" settings, apply for email scope access
4. Wait for LINE approval (may take several business days)

#### Step 3: Clerk LINE Connection with Custom Credentials
```
Dashboard > SSO Connections > LINE
- Enable "Use custom credentials"
- Add Channel ID and Channel Secret from LINE
- In Scopes field, add: `openid profile email`
```

#### Step 4: Handle Missing Requirements in Code

For Next.js with Clerk prebuilt components, minimal handling needed:
```tsx
// The <SignUp /> component handles missing requirements automatically
<SignUp />
```

For custom flows:
```tsx
// After OAuth callback
const { signUp } = useSignUp();

if (signUp?.status === 'missing_requirements') {
  const missing = signUp.missingFields;
  if (missing.includes('email_address')) {
    // Show email collection form
    // After collecting email:
    await signUp.update({ emailAddress: userEmail });
    await signUp.prepareEmailAddressVerification();
    // Then verify with OTP
  }
}
```

---

## Decision Matrix

| Option | Pros | Cons | Recommendation |
|--------|------|------|----------------|
| **A: Apply for LINE email + require in Clerk** | Best UX for LINE users who grant permission; Clerk handles fallback automatically | Requires LINE approval; Some users may not grant email permission | **Recommended** |
| **B: Always collect email manually after LINE OAuth** | No LINE approval needed; Consistent flow | Extra step for all LINE users; Worse UX | Acceptable fallback |
| **C: Make email optional** | Simplest implementation | Violates US-1 requirement (must have email) | **Not viable** |

---

## Implementation Checklist

- [ ] Apply for LINE email permission in LINE Developers Console
- [ ] Configure Clerk Dashboard: enable email as required field with verification
- [ ] Set up LINE social connection with custom credentials and email scope
- [ ] Test with prebuilt `<SignUp />` component (handles missing requirements automatically)
- [ ] (Optional) Build custom "Continue" page for branded missing-requirements UX
- [ ] Test all scenarios:
  - [ ] LINE user grants email permission
  - [ ] LINE user denies email permission
  - [ ] Google signup (always has email)
  - [ ] Email/password signup

---

## References

1. [LINE Login Integration - Scopes](https://developers.line.biz/en/docs/line-login/integrate-line-login/)
2. [Clerk LINE Social Connection](https://clerk.com/docs/guides/configure/auth-strategies/social-connections/line)
3. [Clerk OAuth Connections Custom Flow](https://clerk.com/docs/guides/development/custom-flows/authentication/oauth-connections)
4. [Clerk SignUp Object Reference](https://clerk.com/docs/reference/javascript/sign-up)
5. [Clerk Account Linking for OAuth](https://clerk.com/docs/guides/configure/auth-strategies/social-connections/account-linking)
6. [Clerk Sign-up and Sign-in Options](https://clerk.com/docs/guides/configure/auth-strategies/sign-up-sign-in-options)

---

## Key Takeaways

1. **LINE email is NOT automatic** - requires application to LINE and user consent
2. **Clerk can enforce email requirement** - via Dashboard settings and missing requirements flow
3. **Prebuilt Clerk components handle this gracefully** - `<SignUp />` prompts for missing fields
4. **Apply for LINE email permission early** - approval process may take time
5. **Always test the fallback flow** - some users will decline email sharing
