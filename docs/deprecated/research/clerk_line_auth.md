# Clerk + LINE Login Authentication Research

**Date:** December 3, 2025
**Status:** LINE Login is natively supported by Clerk

---

## Summary

Clerk provides native support for LINE Login as a social connection (OAuth provider). For development environments, Clerk offers pre-configured shared OAuth credentials that require zero configuration. For production environments, you'll need to configure custom credentials from the LINE Developers Console. The authentication flow follows standard OAuth 2.0/OIDC patterns, where Clerk handles the entire OAuth dance and stores basic user profile information (name, email, profile picture) in the User object.

---

## Key Findings

### 1. Native LINE Support
- **LINE is officially supported** as one of Clerk's 25+ social connection providers
- Available alongside Google, GitHub, Microsoft, Facebook, Discord, and others
- Listed in official documentation: https://clerk.com/docs/authentication/social-connections/oauth

### 2. Development vs Production Setup

**Development Instances:**
- Clerk provides pre-configured shared OAuth credentials
- **Zero configuration required** - just enable LINE in dashboard
- Default region: **Japan**
- Redirect URIs are automatically handled
- Perfect for testing and prototyping

**Production Instances:**
- Requires custom OAuth credentials from LINE Developers Console
- Need to create a LINE channel and configure:
  - Channel ID (Client ID)
  - Channel Secret (Client Secret)
  - Authorized redirect URI (provided by Clerk)
- Can choose specific LINE regions (Japan, Thailand, Taiwan, etc.)

### 3. Data Stored by Clerk

When a user authenticates via LINE, Clerk creates a User object containing:

**Core Identity Fields:**
- `id` - Unique Clerk user identifier
- `firstName` - User's first name (if provided by LINE)
- `lastName` - User's last name (if provided by LINE)
- `imageUrl` - Profile picture URL
- `hasImage` - Boolean indicating if profile image exists

**Authentication Identifiers:**
- `emailAddresses[]` - Array of EmailAddress objects (includes primary email)
- `primaryEmailAddress` - Main email from LINE profile
- `externalAccounts[]` - Array containing LINE OAuth connection details
- `externalId` - Optional ID for syncing with external systems

**Metadata (Extensible):**
- `publicMetadata` - Readable from frontend and backend
- `privateMetadata` - Backend-only (sensitive data)
- `unsafeMetadata` - User-editable, can be set during sign-up

**OAuth-Specific:**
- OAuth access tokens can be retrieved via `getUserOauthAccessToken()` method
- Access tokens are refreshed on-demand (not proactively)
- LINE profile picture is copied to Clerk's CDN

### 4. Default OAuth Scopes

Clerk automatically requests essential scopes from LINE:
- **Profile information**: Basic profile data (name, picture)
- **Email access**: User's email address (if available)

These scopes are pre-configured and included by default. Additional scopes can be configured if needed via the `additionalOAuthScopes` prop in Clerk's UI components.

### 5. Authentication Flow

**User-Facing Flow:**
1. User clicks "Sign in with LINE" button in Clerk's UI
2. User redirected to LINE's authorization page
3. User logs in to LINE and grants permissions
4. LINE redirects back to Clerk with authorization code
5. Clerk exchanges code for access token (server-side)
6. Clerk fetches user profile from LINE API
7. Clerk creates or updates User object in database
8. User redirected back to your application (authenticated)

**Technical Flow:**
```
[Your App] -> [Clerk UI] -> [LINE OAuth]
                             ↓
                        [User Authorizes]
                             ↓
                        [LINE Callback]
                             ↓
[Clerk Backend] <- [Token Exchange] <- [LINE API]
       ↓
[User Object Created/Updated]
       ↓
[Session Token Generated]
       ↓
[Redirect to Your App]
```

**Key Security Features:**
- State parameter for CSRF protection
- PKCE (Proof Key for Code Exchange) for public clients
- Clerk handles all token management
- Session tokens stored in HTTP-only cookies
- No sensitive tokens exposed to client-side JavaScript

---

## Implementation Notes

### Getting Started (Development)

1. **Enable LINE in Clerk Dashboard:**
   - Navigate to: SSO connections → Add connection → For all users
   - Select "LINE" from provider dropdown
   - Click "Add connection" (no additional config needed)

2. **Add to Your App:**
   - Use Clerk's prebuilt `<SignIn />` component
   - LINE button appears automatically when enabled
   - Zero additional code required

3. **Test:**
   - Visit your Account Portal: `https://your-domain.accounts.dev/sign-in`
   - Click "Sign in with LINE"
   - Authenticate with LINE account

### Production Setup

1. **Create LINE Channel:**
   - Visit LINE Developers Console: https://developers.line.biz/console/
   - Create new provider/channel
   - Select appropriate region (Japan, Thailand, Taiwan, etc.)

2. **Configure in Clerk:**
   - Navigate to: SSO connections → LINE → Use custom credentials
   - Copy Authorized Redirect URI from Clerk
   - Paste into LINE console's callback URL settings
   - Copy Channel ID and Channel Secret from LINE
   - Paste into Clerk dashboard

3. **Test Production:**
   - Use production account portal: `https://accounts.your-domain.com/sign-in`

### Accessing LINE User Data

**Basic User Info (from Clerk):**
```javascript
// Frontend (React example)
import { useUser } from '@clerk/nextjs';

function Profile() {
  const { user } = useUser();

  return (
    <div>
      <img src={user.imageUrl} alt="Profile" />
      <p>{user.firstName} {user.lastName}</p>
      <p>{user.primaryEmailAddress.emailAddress}</p>
    </div>
  );
}
```

**OAuth Access Token (Backend only):**
```javascript
// Backend API route
import { clerkClient } from '@clerk/nextjs/server';

async function getLINEAccessToken(userId) {
  const client = await clerkClient();
  const response = await client.users.getUserOauthAccessToken(userId, 'line');
  return response.data[0].token;
}
```

### Important Considerations

**Regional Differences:**
- LINE has separate channels for different regions
- Default development credentials use Japan region
- For production, configure channel for target region
- Can support multiple regions by adding multiple LINE connections with different credentials

**Email Availability:**
- Not all LINE users have email addresses in their profiles
- Email may be null - implement fallback authentication methods
- Consider requiring email during onboarding flow

**Account Linking:**
- Users can connect multiple social providers to one account
- If user signs up with email first, they can later connect LINE
- Clerk handles account linking automatically based on email matching

**Sign-up vs Sign-in:**
- OAuth flows are equivalent in Clerk
- If user doesn't exist, account is created automatically
- If user exists (matched by email), they're signed in

**Custom Flows:**
- Can build custom UI using Clerk's JavaScript SDK
- Use `authenticateWithRedirect()` method for LINE OAuth
- Useful if prebuilt components don't fit your design

---

## Sources

1. **Clerk Official Documentation - Social Connections Overview**
   https://clerk.com/docs/authentication/social-connections/overview

2. **Clerk Official Documentation - LINE Social Connection**
   https://clerk.com/docs/guides/configure/auth-strategies/social-connections/line

3. **Clerk Official Documentation - All OAuth Providers**
   https://clerk.com/docs/authentication/social-connections/oauth

4. **Clerk Official Documentation - User Management**
   https://clerk.com/docs/guides/users/managing

5. **Clerk Official Documentation - Backend User Object Reference**
   https://clerk.com/docs/reference/backend/types/backend-user

6. **Clerk Official Documentation - How Clerk Implements OAuth**
   https://clerk.com/docs/guides/configure/auth-strategies/oauth/how-clerk-implements-oauth

7. **Clerk Official Documentation - User Metadata**
   https://clerk.com/docs/guides/users/extending

8. **Clerk Official Documentation - Custom OAuth Providers**
   https://clerk.com/docs/guides/configure/auth-strategies/social-connections/custom-provider

---

## Next Steps

1. **Enable LINE in Development:**
   - Test with Clerk's shared credentials
   - Verify authentication flow works as expected
   - Inspect User object to see what data is available

2. **Create LINE Developer Account:**
   - Register at LINE Developers Console
   - Create channel for target region(s)
   - Note Channel ID and Secret for production setup

3. **Design User Experience:**
   - Decide on primary authentication method (LINE vs email vs phone)
   - Plan for users without LINE accounts
   - Design onboarding flow for first-time users

4. **Test Multi-Account Scenarios:**
   - User signs up with email, later connects LINE
   - User signs up with LINE, later adds email
   - User tries to use LINE account already connected to different email

5. **Configure Production:**
   - Set up custom credentials when ready to deploy
   - Test with real LINE accounts in target region
   - Monitor OAuth success rates and errors

---

## Questions & Answers

**Q: Do we need to build OAuth integration ourselves?**
A: No. Clerk handles the entire OAuth flow. Just enable LINE in the dashboard.

**Q: Can we use LINE in development without setup?**
A: Yes. Clerk provides pre-configured credentials for development instances.

**Q: What user data does Clerk store from LINE?**
A: Basic profile (name, email, profile picture) stored in User object. Full LINE profile accessible via OAuth token if needed.

**Q: How does the authentication flow work?**
A: User clicks LINE button → redirects to LINE → user authorizes → LINE redirects back → Clerk creates/updates user → user signed in.

**Q: Can users sign up without LINE?**
A: Yes. LINE is just one authentication option. Can also enable email/password, phone, other OAuth providers, etc.

**Q: Is LINE Login free to use?**
A: Yes. LINE Login is free. Clerk's pricing is based on Monthly Active Users (MAUs), regardless of authentication method.

**Q: What if user's LINE account doesn't have an email?**
A: Email may be null in User object. Design your app to handle this case (prompt for email during onboarding, or use username/phone instead).

---

## Decision: LINE + Clerk is Viable

**Verdict:** Clerk's native LINE Login support is production-ready and requires minimal implementation effort. Recommended approach for Facelink.

**Rationale:**
- Zero custom OAuth code required
- Secure, standards-compliant implementation
- Handles token management automatically
- Supports Thai market (LINE is dominant in Thailand)
- Easy to add other auth methods (email, phone) as alternatives
- Development credentials make testing effortless
- Production setup is straightforward (just copy/paste credentials)
