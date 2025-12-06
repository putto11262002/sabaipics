# Log 001: Participant Flow + LINE Architecture - RESOLUTION

**Status:** RESOLVED
**Opened:** 2024-12-01
**Resolved:** 2025-12-01
**Context:** [2_feature_positioning.md](../2_feature_positioning.md)

---

## The Decision

**Hybrid approach: Web-first primary + LINE LIFF secondary**

Participants have TWO paths to access photos:

### Path A: Web-First (Primary Flow)

```
1. Photographer shares QR code (at event or via WhatsApp/Facebook)
2. Participant scans QR → redirects to facelink.com/event/{eventId}
3. Web page loads → "Add to LINE" button + social login options
4. Participant chooses:
   - Option A1: "Continue with LINE" (via LINE Login/OAuth2)
   - Option A2: "Continue with Google/Facebook" (social login)
5. Participant completes LINE social connection (if not already connected)
6. Web page shows simple form: "Take a selfie or upload photo"
7. Browser camera: participant takes selfie
8. **Face detection (TINY MODEL, in-browser WebRTC)**
   - If face detected: ✓ Continue
   - If no face detected: ✗ "Please show your face clearly, try again"
9. Selfie + face vector sent to backend search API
10. Search API queries vector store → finds matching event photos
11. Results displayed on web page (thumbnails, processed photos)
12. Participant downloads photos directly from web

---

### Path B: LINE LIFF (Secondary Flow - Convenience)

**For users who want the LINE experience:**

```
1. Photographer shares QR → embedded facelink.liff.app/{eventId} link
   - OR: LINE OA has rich menu → "Find my photos" button opens LIFF
2. Participant opens link in LINE (auto-opens LIFF in-app browser)
3. LIFF loads → miniature version of web experience
4. Participant takes selfie (LIFF has camera access via WebRTC)
5. Same face detection flow (tiny model, in-browser)
6. Selfie + vector sent to backend
7. Backend search returns matches
8. LIFF uses Messaging API to send photos to user via chat
   - Photos displayed as carousel/flex messages in LINE chat
   - User can save/download from there
9. Optional: LINE service notification after search complete

---

## Architecture Components Required

### For Web Path (Primary)

| Component | Decision | Notes |
|-----------|----------|-------|
| **QR code destination** | facelink.com/event/{eventId} | Photographer shares this |
| **Social Login** | LINE OAuth2, Google OAuth2, Facebook | Let users pick |
| **In-browser Face Detection** | Tiny model (WebRTC) | MediaPipe Face Detection (lightweight) |
| **Selfie Upload** | HTML5 canvas + File API | Direct to backend |
| **Search API** | Backend vector search | Query vector store with selfie embedding |
| **Photo Display** | Web gallery (React) | Thumbnails + processed images |
| **Download** | Direct from R2/CDN | Browser download |
| **Fallback** | Web path works without LINE | No LINE required |

### For LINE LIFF Path (Secondary)

| Component | Decision | Notes |
|-----------|----------|-------|
| **LIFF App URL** | facelink.liff.app/{eventId} | Lightweight LIFF mini-app |
| **Camera Access** | WebRTC (same as web) | LIFF supports getUserMedia |
| **Face Detection** | Tiny model (in-browser) | MediaPipe, same as web |
| **Search Call** | LIFF SDK → Backend API | Fetch from LIFF context |
| **Photo Delivery** | Messaging API (flex messages) | Push photos to user's chat |
| **LINE OA Account** | Required | Photographer sets up OA, adds LIFF |
| **Service Messages** | Optional enhancement | Notifications after search |

### Shared Components (Both Paths)

| Component | Technology | Status |
|-----------|-----------|--------|
| **Face Detection Model** | MediaPipe Face Detection (lite) | Tiny, runs in browser |
| **Face Embedding** | AWS Rekognition API (backend) | Sends selfie, gets vector |
| **Vector Search** | Query vector store | Find matching photos |
| **Photo Storage** | Cloudflare R2 | Original + processed |
| **Photo Delivery** | Cloudflare CDN | Fast access to photos |
| **Backend Search API** | TBD (API Backend choice) | Handles vector search, returns results |

---

## Technology Stack Impact

### What This Decides

✅ **LINE LIFF is required** (not optional) - participants need way to send photos in LINE context

✅ **In-browser face detection required** - MediaPipe Face Detection (lightweight, free)

✅ **Messaging API required** - Photographer's LINE OA sends photos back to users

✅ **AWS Rekognition still needed** - For server-side embedding of participant selfies

✅ **Web path must work without LINE** - Fallback for non-LINE users

### Open Questions for Later

- [ ] Does photographer's LINE OA have permission limits for Messaging API?
- [ ] Cost of LINE Messaging API at scale?
- [ ] LIFF vs Mini App - which is better for this use case?
- [ ] How to prevent abuse (fake faces, repeated searches)?
- [ ] User experience: prefer web-first or LINE-first?

---

## Flow Diagrams

### Detailed Web Flow

```
QR Code (facelink.com/event/{eventId})
    ↓
[Web Page Loads]
    ├─ "Continue with LINE" button
    ├─ "Continue with Google" button
    └─ "Continue with Facebook" button
    ↓
[Participant chooses login]
    ↓
[Browser requests camera access]
    ↓
[Participant takes selfie]
    ↓
[MediaPipe Face Detection (in-browser)]
    ├─ Face detected? → Continue
    └─ No face? → "Try again"
    ↓
[Send selfie to backend]
    ↓
[Backend: AWS Rekognition]
    ├─ Embed selfie → Face vector
    └─ Query vector store
    ↓
[Backend: Return matching photos]
    ↓
[Web page displays results]
    ├─ Thumbnail gallery
    ├─ Filter by photographer / time
    └─ Download buttons
    ↓
[Participant downloads from R2/CDN]
```

### Detailed LINE LIFF Flow

```
QR Code (facelink.liff.app/{eventId})
    ↓ [Opens in LINE app]
[LIFF mini-app loads]
    ├─ "Take selfie" button
    └─ "Skip to web" fallback
    ↓
[LIFF gets user context (LINE user ID)]
    ↓
[Participant takes selfie (WebRTC)]
    ↓
[MediaPipe Face Detection (in-browser)]
    ├─ Face detected? → Continue
    └─ No face? → "Try again"
    ↓
[Send selfie to backend + LINE context]
    ↓
[Backend: AWS Rekognition + vector search]
    ↓
[Backend: Get matching photos]
    ↓
[Backend: Use Messaging API to send photos]
    │ (flex messages with photo carousel)
    ↓ [to photographer's LINE OA]
    ↓ [OA forwards to participant via chat]
    ↓
[Participant receives photos in LINE]
    ├─ Save from chat
    ├─ Download
    └─ Share within LINE
```

---

## Impact on Architecture

### What This Resolves (log/001)

**Option selected:** Hybrid (Web-first + LINE LIFF)

**Why:**
1. **Web-first covers everyone** - no LINE required (global reach)
2. **LINE LIFF for Thai UX** - participants expect LINE experience
3. **Both paths share infrastructure** - not doubling work
4. **Photographer controls distribution** - can offer both or just one

### What This Requires (New Components)

**Must have:**
- [ ] **In-browser face detection** (MediaPipe - lightweight, free)
- [ ] **Messaging API integration** (LINE OA sends photos back)
- [ ] **LIFF mini-app** (second frontend after web + desktop + dashboard)
- [ ] **Backend search API** (query vectors, return photos)

**Depends on (other decisions):**
- [ ] **API Backend** - must support REST endpoints for search + Messaging API callbacks
- [ ] **Real-time notification** - optional, but could notify photographer when participant finds photos

---

## Next Steps

### Immediate (Blocking)

1. **API Backend decision** - must support:
   - WebSocket for real-time (optional but nice)
   - REST endpoints for search API
   - LINE Messaging API webhook handling
   - Serverless-friendly

2. **Image Pipeline decision** - must handle:
   - Server-side face embedding (AWS Rekognition)
   - Face vector storage
   - Fast search queries

### Phase 3b (Not blocking MVP)

- [ ] LINE OA setup & Messaging API cost analysis
- [ ] LIFF vs Mini App detailed comparison
- [ ] Anti-abuse mechanisms (prevent repeated searches)
- [ ] User preference testing (web-first vs LINE-first?)

---

## Decision Confirmed

**Participant Flow Architecture:**
- ✅ Web-first path (primary)
- ✅ LINE LIFF path (secondary, convenience)
- ✅ Shared backend (vector search, photo delivery)
- ✅ Photographer's LINE OA sends photos back to participants

**Tech Stack Impact:**
- ✅ MediaPipe Face Detection (in-browser, lightweight)
- ✅ AWS Rekognition (server-side embedding)
- ✅ LINE Messaging API (photo delivery in chat)
- ✅ LIFF mini-app (LINE experience)

**Unblocks:**
- API Backend requirements now clear
- Image Pipeline requirements now clear
- Real-time notification scope now clear

---

**Last updated:** 2025-12-01
**Resolved by:** Architecture decision meeting
