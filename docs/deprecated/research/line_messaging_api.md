# LINE Messaging API Research

**Status:** Complete
**Date:** 2025-12-04
**Purpose:** Deep technical understanding for sending photos to participants via LINE

---

## Context

Participants find their photos → click "Send to LINE" → photos arrive in their LINE chat.

---

## 1. LINE Login vs LINE Messaging API

| Service            | Purpose                                      | Returns           |
| ------------------ | -------------------------------------------- | ----------------- |
| LINE Login         | User authentication                          | `userId`, profile |
| LINE Messaging API | Send messages FROM Official Account TO users | -                 |

**Critical:** The `userId` from LINE Login IS the same identifier used in Messaging API `to` field.

---

## 2. Required Accounts & Channels

| Component                  | Purpose                                        |
| -------------------------- | ---------------------------------------------- |
| LINE Official Account (OA) | Your brand/service identity to users           |
| Messaging API Channel      | Technical channel, provides access token       |
| LINE Login Channel         | User authentication (optional but recommended) |

**All channels must be under the same Provider** in LINE Developers Console.

---

## 3. Push Messages

### Endpoint

```
POST https://api.line.me/v2/bot/message/push
Authorization: Bearer {channel_access_token}
```

### Request Body

```json
{
  "to": "U4af4980629...",
  "messages": [...]
}
```

### Rate Limits

- Push messages: 2,000 requests/second
- Multicast: 200 requests/second (use push instead)

---

## 4. Sending Images

### Option 1: Image Message (Single Photo)

```json
{
  "type": "image",
  "originalContentUrl": "https://cdn.example.com/photo.jpg",
  "previewImageUrl": "https://cdn.example.com/photo-preview.jpg"
}
```

**Requirements:**

- Both URLs must be HTTPS (TLS 1.2+)
- Preview: ~240x240px recommended
- Original: No hard limit, <5MB practical

### Option 2: Image Carousel (Multiple Photos) ← RECOMMENDED

```json
{
  "type": "template",
  "altText": "Your event photos",
  "template": {
    "type": "imageCarousel",
    "columns": [
      {
        "imageUrl": "https://cdn.example.com/photo1.jpg",
        "action": {
          "type": "uri",
          "uri": "https://app.example.com/download/photo1"
        }
      },
      {
        "imageUrl": "https://cdn.example.com/photo2.jpg",
        "action": {
          "type": "uri",
          "uri": "https://app.example.com/download/photo2"
        }
      }
    ]
  }
}
```

**Advantages:**

- Users swipe horizontally through photos
- Can add action buttons (download link)
- ~10 images per carousel
- Mobile-friendly UX

### Option 3: Flex Message (Advanced Layout)

Full customization with images, text, buttons. Complex JSON structure.

---

## 5. CRITICAL: Friendship Requirement

### The Problem

**You can ONLY send push messages to users who have added your Official Account as a friend.**

If user is not a friend:

- Message silently fails
- HTTP 200 returned but not delivered
- No error indication

### Solution: Add Friend During LINE Login

LINE Login can prompt users to add OA as friend during authentication:

- "Add as friend" toggle on consent screen
- Design improved September 2025 (more visible)
- Seamless UX - happens during login flow

### Tracking Friendship Status

Use webhooks:

- `follow` event → user added OA as friend
- `unfollow` event → user removed OA as friend

Store `line_linked` boolean in database.

---

## 6. Webhooks

### Events

| Event      | When                      |
| ---------- | ------------------------- |
| `follow`   | User adds OA as friend    |
| `unfollow` | User removes OA as friend |
| `message`  | User sends message to OA  |

### Signature Verification

LINE sends `X-Line-Signature` header. Verify with:

- HMAC-SHA256
- Channel Secret as key
- Request body as message

---

## 7. Cost

### LINE Official Account Plans

| Plan     | Free Messages/Month | Price      |
| -------- | ------------------- | ---------- |
| Free     | 200                 | Free       |
| Light    | 10,000              | ~$1/month  |
| Standard | 100,000             | ~$15/month |

**No per-message fees** once subscribed (unlike SMS/WhatsApp).

### For Our Platform

- 100 participants × 3 messages = 300/event
- Free plan (200/month) insufficient
- Light plan ($1/month) covers most events

---

## 8. Channel Setup

### Steps

1. Create LINE Official Account (LINE OA Manager)
2. Create Provider in LINE Developers Console
3. Create Messaging API Channel under Provider
4. Create LINE Login Channel under same Provider
5. Link OA to Messaging API Channel
6. Configure webhook URL

### Channel Access Token

- Generated in LINE Developers Console
- Long-lived (doesn't expire easily)
- Used in `Authorization: Bearer {token}` header

### userId Consistency

**Same userId across:**

- LINE Login response
- Webhook events
- Push message `to` field

---

## 9. Gotchas

| Gotcha                         | Detail                                                        |
| ------------------------------ | ------------------------------------------------------------- |
| Preview required               | Must provide both `originalContentUrl` AND `previewImageUrl`  |
| HTTPS only                     | All image URLs must be HTTPS with TLS 1.2+                    |
| Friendship silent failure      | Push returns 200 but doesn't deliver if not friend            |
| Image URLs fetched immediately | LINE servers fetch preview on send - hosting must be reliable |
| No native download tracking    | User downloads go to phone album, can't track directly        |

---

## 10. Implementation Flow

```
1. User logs in via LINE Login
   → Prompted to add OA as friend
   → Backend receives userId
   → Store userId + line_linked=true

2. User finds photos, clicks "Send to LINE"

3. Backend checks line_linked
   → If false: prompt to add friend
   → If true: proceed

4. Backend calls push API
   POST /v2/bot/message/push
   {
     "to": "{userId}",
     "messages": [Image Carousel]
   }

5. User receives photos in LINE chat
```

---

## References

| Topic              | URL                                                                 |
| ------------------ | ------------------------------------------------------------------- |
| Messaging API Docs | https://developers.line.biz/en/docs/messaging-api/                  |
| API Reference      | https://developers.line.biz/en/reference/messaging-api/             |
| Message Types      | https://developers.line.biz/en/docs/messaging-api/message-types/    |
| Sending Messages   | https://developers.line.biz/en/docs/messaging-api/sending-messages/ |
