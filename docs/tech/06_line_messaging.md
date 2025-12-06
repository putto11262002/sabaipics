# LINE Messaging Design

**Status:** Complete
**Last Updated:** 2025-12-04

---

## Overview

Send event photos to participants via LINE chat.

**Use case:** Participant finds photos → clicks "Send to LINE" → receives photos in LINE.

**Flow:** Participant Web → API → LINE Messaging API → User's LINE Chat

---

## Critical Decision 1: Two Separate LINE Services

| Service | Purpose | Channel |
|---------|---------|---------|
| LINE Login | Authenticate participant | LINE Login Channel (via Clerk) |
| LINE Messaging API | Send photos to participant | Messaging API Channel |

**Key insight:** Same `userId` across both. Login gives us the ID, Messaging API uses it.

---

## Critical Decision 2: Friendship Requirement

**CRITICAL:** Can only push messages to users who are friends of our Official Account (OA).

| User State | `line_linked` | Can Send? |
|------------|---------------|-----------|
| Not logged in | - | No |
| Logged in, not friend | `false` | No (silent fail) |
| Logged in + friend | `true` | Yes |

### Solution: Add Friend During Login

| Step | What Happens |
|------|--------------|
| 1 | User clicks "Sign in with LINE" |
| 2 | Clerk redirects to LINE with `bot_prompt=aggressive` |
| 3 | LINE shows consent screen with "Add friend" option |
| 4 | User approves + adds friend |
| 5 | Callback includes `friendship_status_changed=true` |
| 6 | We set `line_linked=true` in database |

### Tracking Friendship

| Event | Action |
|-------|--------|
| LINE Login callback | Check `friendship_status_changed` param |
| Webhook: `follow` | Set `line_linked=true` |
| Webhook: `unfollow` | Set `line_linked=false` |

---

## Critical Decision 3: Message Format

**Choice:** Image Carousel

| Format | Pros | Cons |
|--------|------|------|
| Single image messages | Simple | Clutters chat with many messages |
| Image Carousel | Swipeable, clean, action buttons | ~10 image limit |
| Flex Message | Full customization | Complex JSON |

### Image Carousel Structure

| Field | Value |
|-------|-------|
| Type | `template` |
| Template type | `imageCarousel` |
| Max columns | ~10 |
| Action | URI to download page |

### What We Send

| Scenario | Message |
|----------|---------|
| ≤10 photos | Single carousel |
| >10 photos | Multiple carousels OR carousel + "View all" link |

---

## Critical Decision 4: Image Requirements

| Requirement | Value |
|-------------|-------|
| Protocol | HTTPS (TLS 1.2+) |
| Format | JPEG, PNG |
| Original size | <5MB practical |
| Preview size | ~240x240px |

### Image URLs

| Type | Source |
|------|--------|
| Carousel images | Cloudflare Images transform (thumbnail) |
| Action URL | Link to download page (signed URL) |

**Note:** LINE servers fetch images immediately on send. CDN required.

---

## Critical Decision 5: API Integration

### Endpoint

```
POST https://api.line.me/v2/bot/message/push
```

### Authentication

| Header | Value |
|--------|-------|
| `Authorization` | `Bearer {MESSAGING_API_CHANNEL_TOKEN}` |
| `Content-Type` | `application/json` |

### Request Body

| Field | Value |
|-------|-------|
| `to` | `userId` from LINE Login |
| `messages` | Array of message objects (max 5) |

---

## Critical Decision 6: Send Flow

| Step | Component | Action |
|------|-----------|--------|
| 1 | Participant Web | Click "Send to LINE" with selected photos |
| 2 | API | Validate: user logged in? |
| 3 | API | Check `line_linked=true`? |
| 4 | API | If false: return error, prompt to add friend |
| 5 | API | Build Image Carousel message |
| 6 | API | Call LINE push endpoint |
| 7 | API | Record delivery in `line_notifications` table |
| 8 | API | Return success |
| 9 | LINE | Deliver to user's chat |

### Error Handling

| Error | Response | Action |
|-------|----------|--------|
| Not logged in | 401 | Prompt LINE Login |
| Not friend (`line_linked=false`) | 422 `LINE_NOT_LINKED` | Show "Add friend" prompt |
| LINE API error | 500 | Retry with backoff |
| Rate limited | 429 | Queue and retry |

---

## Critical Decision 7: Webhook Handling

### Endpoint

```
POST /api/webhooks/line
```

### Events We Handle

| Event | Action |
|-------|--------|
| `follow` | Set `line_linked=true` for participant |
| `unfollow` | Set `line_linked=false` for participant |

### Signature Verification

| Component | Value |
|-----------|-------|
| Header | `X-Line-Signature` |
| Algorithm | HMAC-SHA256 |
| Key | `LINE_CHANNEL_SECRET` |
| Message | Raw request body |

---

## Critical Decision 8: Channel Setup

### Required Channels (Same Provider)

| Channel | Purpose |
|---------|---------|
| LINE Login Channel | User authentication (via Clerk) |
| Messaging API Channel | Send push messages |

### Link to Official Account

| Step | Where |
|------|-------|
| 1 | Create LINE Official Account |
| 2 | LINE OA Manager → Settings → Messaging API → Enable |
| 3 | Link to Messaging API Channel |

### Secrets

| Secret | Used For |
|--------|----------|
| `LINE_CHANNEL_SECRET` | Webhook signature verification |
| `LINE_CHANNEL_ACCESS_TOKEN` | Push message authentication |

---

## Critical Decision 9: Cost

### LINE OA Plans

| Plan | Free Messages/Month | Cost |
|------|---------------------|------|
| Free | 200 | Free |
| Light | 10,000 | ~$1/month |
| Standard | 100,000 | ~$15/month |

### Our Estimate

- 100 participants × 3 messages = 300/event
- Need Light plan minimum ($1/month)

**No per-message fees** - fixed monthly subscription.

---

## Critical Decision 10: Rate Limits

| Operation | Limit |
|-----------|-------|
| Push messages | 2,000 req/sec |
| Multicast | 200 req/sec |

**Strategy:** Use individual push (not multicast) for better rate limit.

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│ Participant Web                                          │
│                                                          │
│ [Select photos] → [Send to LINE button]                  │
└────────────────────────────┬────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────┐
│ API: POST /api/line/send                                 │
│                                                          │
│ 1. Validate participant logged in                        │
│ 2. Check line_linked=true                                │
│ 3. Build Image Carousel                                  │
│ 4. Call LINE Messaging API                               │
│ 5. Record in line_notifications                          │
└────────────────────────────┬────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────┐
│ LINE Messaging API                                       │
│                                                          │
│ POST /v2/bot/message/push                                │
│ Authorization: Bearer {token}                            │
│ { "to": "userId", "messages": [...] }                    │
└────────────────────────────┬────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────┐
│ User's LINE Chat                                         │
│                                                          │
│ [Image Carousel with event photos]                       │
│ [Tap to download]                                        │
└─────────────────────────────────────────────────────────┘
```

---

## References

| Topic | Reference |
|-------|-----------|
| Deep research | `dev/research/line_messaging_api.md` |
| LINE Login research | `dev/research/line_login_oauth.md` |
| Clerk + LINE | `dev/research/clerk_line_auth.md` |
| Primary doc (flows) | `00_flows.md` Flow 8 |
| Primary doc (use cases) | `00_use_cases.md` U4, S3 |
| Primary doc (business rules) | `00_business_rules.md` Section 6.2 |
| Official: Messaging API | https://developers.line.biz/en/docs/messaging-api/ |
| Official: Push Messages | https://developers.line.biz/en/reference/messaging-api/#send-push-message |
| Official: Message Types | https://developers.line.biz/en/docs/messaging-api/message-types/ |
