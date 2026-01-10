# Decisions Input — S-1: Photographer Onboarding & Photo Upload

Fill in your answers below. Delete options you don't want, or add comments.

---

## Blocking Decisions (must answer)

### 1. Session Timeout Policy
**Question:** How long should photographer sessions last?

Pick one:
<mark data-comment="1">- [ ] A) 24 hours (convenience, higher risk)</mark>
<!-- COMMENT-1: Go with this one -->
- [ ] B) 4 hours with auto-refresh (balanced)
- [ ] C) 1 hour strict (security-first)

Your notes:


---

### 2. HEIC/RAW File Handling
**Question:** How to handle non-JPEG uploads?

**Research says:** Use Cloudflare Images Transform (converts HEIC → JPEG before Rekognition)

- [ ] Accept research recommendation
<mark data-comment="2">- [ ] Other approach:</mark>
<!-- COMMENT-2: ust reect HEIC and RAW for now ok only support png and jpeg -->


---

### 3. Credit Package Pricing
**Question:** Where to store credit packages? And what prices?

**Research says:** Hardcode in API for MVP, migrate to DB later

- [ ] Accept research recommendation
<mark data-comment="3">- [ ] Other approach:</mark>
<!-- COMMENT-3: Ok just store packages in db allow user to edit price and amount of credit OK. -->

**Prices (THB):** Are these correct?
- [ ] 299 THB = ??? credits
- [ ] 999 THB = ??? credits
- [ ] 2,499 THB = ??? credits
- [ ] 6,999 THB = ??? credits

Your prices (if different):


---

### 4. User Type Verification (Photographer vs Participant)
<mark data-comment="4">**Question:** How do we know a signup is a photographer, not a participant?</mark>
<!-- COMMENT-4: So for the dashboard singup it is only for photogtapher. Participants never sign up Ok. Just photographer sign up. No auth for partipanrts? -->

Pick one:
- [ ] A) Separate Clerk apps (cleanest, but two integrations)
- [ ] B) Admin approval queue (adds friction)
- [ ] C) Signup URL validation + soft-lock if suspicious (quickest MVP)

Your notes:


---

## Minor Questions (optional but helpful)

<mark data-comment="5">### Thumbnails</mark>
<!-- COMMENT-5: Use on demain resize e.g. in thik cloudfalre allow on demand trnasofration via url no? -->
<mark data-comment="9">- [ ] Use face-aware cropping (`gravity=face`) for gallery thumbnails?</mark>
<!-- COMMENT-9: NO now of out scope OK. -->
<mark data-comment="10">- [ ] What thumbnail size? (default: 200px)</mark>
<!-- COMMENT-10: Should it be base on the size and aspect ration of original right what are common DSLR sizes and use somethin like max width to to reize for ewb purpose. Waht do you suggest? -->

### QR Codes
<mark data-comment="6">- [ ] Generate eagerly (on event create) — recommended</mark>
<!-- COMMENT-6: Yes -->
- [ ] Generate lazily (on first download)

### Stripe / Payments
<mark data-comment="7">- [ ] Enable PromptPay for Thai market? (recommended: yes)</mark>
<!-- COMMENT-7: YEs -->
<mark data-comment="8">- [ ] Credit expiration policy? (suggested: 6 months)</mark>
<!-- COMMENT-8: Yes 6 month from date of purchase -->

### Other Feedback
Add any other thoughts, concerns, or changes here:


---

When done, save this file and come back to chat with "done" or "ready".
