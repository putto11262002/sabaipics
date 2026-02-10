# FrameFast Legal Checklist (Thailand PDPA + Apple)

Last updated: 2026-02-10

This document is an engineering/product checklist to help draft (and review) **Privacy Policy** and **Terms of Service** for FrameFast. It is **not legal advice**.

---

## A) Thailand PDPA — what your documents must cover

### 1) Identify roles and scope

- [ ] Confirm the **Data Controller** identity: “FrameFast operated by Put Suthisrisinlpa”.
- [ ] Publish at least a **privacy contact email**; a physical address can be a business address/PO box if you don’t want to share a home address (confirm with counsel).
- [ ] Map the roles per workflow:
  - **Photographer**: user of Studio/Dashboard.
  - **Event participant**: public user uploading a selfie for “find my photos”.
  - **FrameFast**: usually the **Data Controller** for platform processing; photographers may also be controllers for their event content (get legal advice on the exact role split).
- [ ] List Data Processors/Sub-processors (Cloudflare, AWS, Clerk, Stripe, Sentry, etc.).

### 2) Privacy notice content (minimum structure)

Your Privacy Policy should clearly describe:

- [ ] **What personal data** you collect (categories + examples).
- [ ] **Purposes** for collecting/using it.
- [ ] **Legal bases** for processing (e.g., contract, consent, legitimate interest, legal obligation).
- [ ] **Sensitive personal data** handling (see #3).
- [ ] **Disclosure/recipients** (third parties; sub-processors).
- [ ] **Cross-border transfers** (where data may be stored/processed outside Thailand, and safeguards).
- [ ] **Retention** (how long data is kept; deletion triggers).
- [ ] **Data subject rights** and how to exercise them.
- [ ] **Security measures** (high-level).
- [ ] **Contact** for privacy requests/complaints.
- [ ] **Change management** (policy version/“last updated” date).

### 3) Sensitive personal data (biometric / face recognition)

Because FrameFast supports face-based search:

- [ ] Treat **biometric data** as sensitive personal data under PDPA.
- [ ] Require **explicit consent** before participants upload a selfie for face search.
- [ ] Explain **what happens** to the selfie (upload → processing → match results) and the **scope limitation** (search within a specific event).
- [x] State clearly whether you use selfies/face data for model training (FrameFast: no model training).
- [ ] Provide a clear way to **withdraw consent** and request deletion (and explain consequences).
- [ ] Limit purpose: “find matching photos for this event” (avoid vague “improve our AI” language unless you actually do that and have a lawful basis).

### 4) Rights and request handling (operational)

Your documents should reflect your actual operational process:

- [ ] Access/copy request flow (who can request, identity verification).
- [ ] Correction/rectification.
- [ ] Deletion/destruction.
- [ ] Restriction/objection.
- [ ] Consent withdrawal.
- [ ] Data portability (where applicable).
- [ ] Target timelines + escalation (legal will confirm exact obligations).

### 5) Data breach response (policy + runbook alignment)

- [ ] Maintain an internal incident process.
- [ ] Ensure your policy does not overpromise (e.g., “we notify within X hours”) unless you can meet it.
- [ ] Confirm PDPA notification thresholds/timelines with counsel and reflect them consistently.

---

## B) Apple — what Apple typically expects (Privacy + App Store)

### 1) Privacy Policy URL is required in App Store Connect

- [ ] Provide a publicly accessible Privacy Policy URL for each app/platform listing in App Store Connect.
- [x] Make sure `https://framefast.io/privacy` and `https://framefast.io/terms` resolve without login and load fast.

### 2) “App Privacy” (nutrition label) must match reality

- [ ] Complete **App Privacy Details** in App Store Connect accurately.
- [ ] Ensure your policy matches the declared data collection/use categories.
- [ ] If you use third-party SDKs (e.g., Sentry), ensure disclosures are consistent.

### 3) Permissions and purpose strings

For iOS (FrameFast Studio), ensure alignment between:

- [ ] Info.plist purpose strings (e.g., Camera, Local Network).
- [ ] In-app UX explaining why permissions are needed.
- [ ] Privacy Policy describing these permissions and associated data handling.

### 4) In-App Purchase (if used)

- [ ] If you sell credits/subscriptions via Apple IAP, ensure the Terms cover:
  - refund handling (Apple policies),
  - pricing/availability,
  - expiration rules,
  - any subscription auto-renew language (only if you offer subscriptions).

---

## C) Mapping to current FrameFast system (from codebase)

### Personal data categories observed

- Photographers: email, name, Clerk user ID; Stripe customer/session IDs; consent timestamps and (optional) IP; event metadata.
- Participants: selfie image (stored in object storage), consent timestamp, IP, matched photo IDs.
- Content: event photos stored in object storage; face detection/indexing using the configured face-recognition service provider.
- Operational: error logs/monitoring (Sentry in API worker).

### Retention observed

- Events are configured with an expiry window and a cleanup process; deletion includes event photos, participant selfies/search records, and face recognition collections (hard delete path exists).
- Default values in the API environment config suggest ~30 days retention for event expiry, plus additional grace for hard deletion.

---

## D) Open gaps (need answers to finalize the draft)

- [x] Official contact email: support@framefast.io
- [x] Public contact method: email-only (no published physical address).
- [x] Governing law/jurisdiction for Terms of Service: Thailand.
- [x] Apple IAP: not currently (Stripe-only via web dashboard).
- [ ] Website analytics/marketing cookies: confirm which providers (if any) are enabled and list them in the Privacy Policy / cookie banner.
- [x] Primary DB region: Neon (Singapore).
- [x] Object storage region: Cloudflare R2 (Singapore).
- [ ] Confirm face-processing provider/regions (can keep provider unnamed, but ensure App Store disclosures match reality).
- [x] Support urgent deletion requests via email.

---

## References (starting points)

- Thailand PDPA (unofficial English translation / commentary): https://www.pdpa.io/
- Thailand PDPC (official site): https://www.pdpc.or.th/
- Apple: Adding a Privacy Policy URL in App Store Connect help (official): https://developer.apple.com/help/app-store-connect/manage-app-information/provide-a-privacy-policy/
- Apple: App Privacy details / “nutrition label” guidance (official): https://developer.apple.com/app-store/app-privacy-details/
- Apple: Manage app privacy (official support): https://support.apple.com/en-us/102399
