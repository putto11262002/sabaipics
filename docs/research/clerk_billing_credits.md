# Clerk Billing & Credits Research

**Research Date:** December 3, 2025
**Status:** Beta (as of 2024-2025)

## Summary

Clerk Billing is currently in **Beta** with APIs marked as experimental and subject to breaking changes. It provides a subscription-based billing system integrated with Stripe, using a hierarchical model of Subscriptions → Subscription Items → Plans → Features. However, **Clerk Billing does NOT appear to support custom credit/token systems** for usage-based billing like photo credits. It is designed for subscription-tier billing (Free, Pro, Enterprise) with feature gating, not metered consumption tracking.

## Key Findings

### 1. Beta Status & Stability Warning

- **Status:** Clerk Billing is in Beta (confirmed in multiple 2024-2025 docs)
- **Breaking Changes:** APIs are experimental and may undergo breaking changes
- **Recommendation:** Pin SDK and `clerk-js` package versions to avoid disruptions
- **API Version:** Latest Clerk API version 2025-11-10 includes "more consistency and clarity to the Clerk Billing API endpoints"
- **Adoption:** Despite beta status, customers are building real businesses (1 customer made $100,000+ within 6 months of beta launch as of Oct 2025)

### 2. What Clerk Billing Is Designed For

Clerk Billing is a **subscription management system** for:
- B2C and B2B applications
- Tier-based pricing (Free, Pro, Enterprise plans)
- Feature gating (enable/disable features per plan)
- Free trials (minimum 1 day, maximum 365 days)
- Recurring billing (monthly/annual)
- Stripe integration for payments

### 3. What Clerk Billing Is NOT

- **NOT a credit/token system:** No built-in support for consumption-based credits (e.g., "photo credits")
- **NOT metered billing:** Does not track unit consumption (photos processed, API calls, etc.)
- **NOT usage-based:** Pricing is per subscription tier, not per-unit usage

## Credit System Details

### Does Clerk Support Custom Credits?

**No evidence found** that Clerk Billing supports:
- Custom credit packages (e.g., 200 photos for $50)
- Consumption tracking (photo uploads, searches, etc.)
- Credit balances per user
- Pay-as-you-go models
- Top-up credit purchases

### What About Usage-Based Billing?

Searches for "Clerk Billing usage-based," "Clerk metered billing," and "Clerk credits tokens" returned **no relevant results**. The system appears to be **tier-based only**.

### Workaround Option

If you want credit-based billing with Clerk auth:
1. Use Clerk for authentication only
2. Build custom credit tracking in your own database
3. Use Stripe directly for payment processing (not Clerk Billing)
4. Track credit balances, consumption, and purchases in your app

## Data Model

Clerk Billing uses a hierarchical structure:

```
Subscription (top-level container per user/org)
  └── Subscription Items (user/org + Plan relationship)
       └── Plans (pricing tiers: Free, Pro, etc.)
            └── Features (capabilities included in plan)
```

### Subscriptions

- Top-level container unique to each user or organization
- Created when user/org is created or when Billing is enabled
- Tracks overall billing relationship

### Subscription Items

- Represents relationship between payer (user/org) and a Plan
- Only ONE active subscription item per payer-Plan combination
- Default Plan subscription item has consistent ID for tracking non-paying customers

### Plans

- Pricing tiers (e.g., Free, Pro, Enterprise)
- Can have free trials (1-365 days)
- Recurring billing periods (monthly/annual supported)
- Feature-based access control

### Features

- Specific capabilities/functionalities to control access
- Can be gated per Plan (e.g., "teams" feature only on Pro plan)
- Used in authorization checks: `org:<feature>:<permission>`
- Managed in Clerk Dashboard Features page

## Stripe Integration

### How It Works

1. **Automatic User Linking:** Clerk users/customers are automatically linked to Stripe
2. **Dashboard Configuration:** Configure plans in Clerk Dashboard
3. **Pre-built Components:** Drop-in billing UI components
4. **No Manual Webhook Mapping:** Unlike manual Stripe integration, Clerk handles webhook routing
5. **Payment Processing:** Stripe handles actual payment processing

### Setup Process

1. Connect Stripe account in Clerk Dashboard
2. Create Plans in Clerk Dashboard (not Stripe directly)
3. Define Features per Plan
4. Use Clerk's pre-built billing components
5. Stripe automatically processes payments

### Payment Methods

- Credit card required for free trials (prevents abuse)
- Default payment method used for recurring charges
- Users can manage payment methods through Clerk UI

## Webhook Events

Clerk Billing provides webhooks for tracking billing lifecycle:

### Subscription Events
- `subscription.created` - Top-level subscription created
- `subscription.updated` - Properties changed (no status change)
- `subscription.active` - Transitioned to active status
- `subscription.pastDue` - Payment delinquency detected

### Subscription Item Events
- `subscriptionItem.updated` - Properties changed
- `subscriptionItem.active` - Became active
- `subscriptionItem.canceled` - User canceled
- `subscriptionItem.ended` - Subscription ended
- `subscriptionItem.abandoned` - Checkout abandoned
- `subscriptionItem.upcoming` - Deferred plan change pending
- `subscriptionItem.incomplete` - Checkout started, payment pending
- `subscriptionItem.pastDue` - Recurring charge failed
- `subscriptionItem.freeTrialEnding` - 3 days before trial ends

### Payment Attempt Events
- `paymentAttempt.created` - Payment initiated (pending)
- `paymentAttempt.updated` - Payment updated (paid/failed)

## Authorization & Access Control

Clerk Billing integrates with authorization checks:

```javascript
// Check if user has access to a feature
auth().has({ feature: "teams" })

// Check if user is on a specific plan
auth().has({ plan: "pro" })

// Check if org member has permission (combines billing + roles)
auth().has({ permission: "org:teams:manage" })
```

**Important:** Permission checks only work if the Feature is included in the Organization's active Plan.

## Session Tokens

Clerk embeds billing info in session tokens:

- `pla` claim: Active plan in format `scope:planslug` (e.g., `u:free`, `o:pro`)
- `fea` claim: List of features available
- `o.fpm` claim: Feature payment modes (list of integers)

## Free Trials

### Key Features
- Minimum 1 day, maximum 365 days trial period
- Credit card required to start (prevents abuse)
- Only users who never paid or trialed can start
- 3-day expiration warning (email + webhook)
- Can extend, cancel, or end immediately (only while active)

### Trial End Behavior
- **Canceled during trial:** User keeps access until trial end date, no charge
- **Not canceled:** Default payment method charged, subscription becomes active
- **If trial < 3 days:** Notifications sent immediately on trial start

## Production Usage

### Pricing
- Free plan: Up to 10,000 monthly active users
- Organizations feature available in development mode for testing
- Production use requires paid plan

### SDK Compatibility (2025-11-10 API version)

Supported SDKs include:
- Next.js (@clerk/nextjs v6.35.0+)
- React Router (@clerk/react-router v2.2.0+)
- Expo (@clerk/expo v2.19.0+)
- Go (clerk-sdk-go v2.5.0+)
- Python (clerk_backend_api v4.0.0+)
- And 10+ other frameworks

## Limitations for Photo Credit Use Case

For a usage-based photo credit system like Facelink:

### What Clerk Billing Cannot Do:
1. Track per-photo consumption
2. Manage credit balances (e.g., "200 photos remaining")
3. Support pay-as-you-go pricing
4. Offer credit packages (e.g., $50 for 200 photos)
5. Handle credit top-ups
6. Provide usage analytics (photos used per event)

### Alternative Approach:
If you want to use Clerk (for auth), you would need to:
1. Use Clerk for authentication only (NOT Clerk Billing)
2. Build custom credit tracking table in your database:
   ```sql
   user_credits (
     user_id UUID,
     total_credits INT,
     used_credits INT,
     remaining_credits INT,
     last_purchase_date TIMESTAMP
   )

   credit_transactions (
     transaction_id UUID,
     user_id UUID,
     amount INT,
     type ENUM('purchase', 'usage'),
     description TEXT,
     timestamp TIMESTAMP
   )
   ```
3. Integrate Stripe directly for credit purchases
4. Track photo consumption in your app logic
5. Deduct credits on photo operations

## Recommendations

### If You Need Credit-Based Billing:

**Do NOT use Clerk Billing.** Consider:
1. **Stripe Billing + Metered Usage:** Stripe supports metered billing natively
2. **Custom Implementation:** Build credit system with your own database + Stripe checkout
3. **Specialized Tools:** Consider tools like Lago (open-source metered billing) or Metronome

### If You Need Subscription Tiers:

**Clerk Billing is appropriate** if your model is:
- Free plan: 50 photos/event
- Pro plan: 500 photos/event
- Enterprise plan: Unlimited photos

But NOT if your model is:
- $0.25 per photo
- Buy 200 credits for $50
- Pay-as-you-go consumption

## Sources

- [Clerk Billing Free Trials Documentation](https://clerk.com/docs/guides/billing/free-trials)
- [Clerk Billing Webhooks Documentation](https://clerk.com/docs/nextjs/guides/development/webhooks/billing)
- [Clerk Authorization Checks Documentation](https://clerk.com/docs/guides/secure/authorization-checks)
- [Clerk Features Documentation](https://clerk.com/docs/guides/secure/features)
- [Clerk API Upgrade Guides](https://clerk.com/docs/guides/development/upgrading/overview)
- [Clerk Organizations Documentation](https://clerk.com/docs/guides/organizations/roles-and-permissions)
- [LinkedIn: Colin Sidoti on Clerk Billing Beta Success](https://www.linkedin.com/posts/colin-sidoti-751a219_sdk-engineer-billing-activity-7393887707116134400-ijbq)
- [YouTube: Building AI Podcast SaaS with Clerk Billing](https://www.youtube.com/watch?v=tg0AI_ckcFg)
- [Dev.to: 2025 SaaS Tech Stack with Clerk + Stripe](https://dev.to/nish2005karsh/part-1-the-ultimate-2025-saas-tech-stack-build-launch-and-monetize-in-under-10-minutes-1m61)
