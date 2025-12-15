# 007 - LINE Integration Setup

**Date:** 2025-12-15
**Branch:** `feat/line-integration`
**Status:** Complete

---

## Summary

Set up LINE Messaging API infrastructure for webhook handling. This is infrastructure-only - no application logic or database tables.

---

## What Was Implemented

| Component | Description |
|-----------|-------------|
| **Environment Config** | Added `LINE_CHANNEL_SECRET` and `LINE_CHANNEL_ACCESS_TOKEN` to `.dev.vars.example` |
| **LINE SDK** | Installed `@line/bot-sdk` for types and future push message support |
| **Signature Verification** | Custom HMAC-SHA256 verification using Web Crypto API (Cloudflare Workers compatible) |
| **Webhook Endpoint** | `POST /api/webhooks/line` with event logging |
| **Tests** | 13 tests for signature verification |

---

## Files Created

| File | Purpose |
|------|---------|
| `apps/api/src/lib/line/webhook.ts` | `verifyLineSignature()` - HMAC-SHA256 signature verification |
| `apps/api/src/lib/line/index.ts` | Barrel export |
| `apps/api/src/routes/webhooks/line.ts` | LINE webhook router with event logging |
| `apps/api/.dev.vars.example` | Example environment variables file |
| `apps/api/tests/line-webhook.test.ts` | Signature verification tests |

---

## Files Modified

| File | Change |
|------|--------|
| `apps/api/src/routes/webhooks/index.ts` | Added LINE webhook router |
| `apps/api/package.json` | Added `@line/bot-sdk` dependency |

---

## Key Decisions

### 1. Custom Signature Verification (not SDK middleware)

**Why:** The official `@line/bot-sdk` middleware uses Node.js `crypto.timingSafeEqual` which doesn't work on Cloudflare Workers edge runtime.

**Solution:** Implemented custom verification using Web Crypto API:
- `crypto.subtle.importKey()` for HMAC key
- `crypto.subtle.sign()` for HMAC-SHA256
- Custom timing-safe string comparison

### 2. Event Logging Only

All LINE webhook events are logged with placeholder handlers. Specific logic (like updating `line_linked` in database) will be added when database tables exist.

**Events handled:**
- `follow` - User adds bot as friend
- `unfollow` - User blocks/removes bot
- `message` - Text, image, etc.
- `join`/`leave` - Bot joins/leaves groups
- `memberJoined`/`memberLeft` - Group membership changes
- `postback` - Button interactions
- `beacon` - Location-based events
- `accountLink` - External account linking
- `unsend` - Message deletion
- `videoPlayComplete` - Video watch completion

---

## Environment Variables

```bash
# LINE Messaging API (add to .dev.vars)
LINE_CHANNEL_SECRET=xxx          # For webhook signature verification
LINE_CHANNEL_ACCESS_TOKEN=xxx    # For push message authentication (future use)
```

**Where to get:**
1. Go to [LINE Developers Console](https://developers.line.biz/console/)
2. Select Provider → Messaging API Channel
3. Channel Secret: Basic settings tab
4. Access Token: Messaging API tab → Issue (long-lived)

---

## Webhook URL Configuration

After deployment, configure webhook URL in LINE Developers Console:

| Environment | Webhook URL |
|-------------|-------------|
| Development | `https://{NGROK_DOMAIN}/api/webhooks/line` |
| Staging | `https://api-staging.sabaipics.com/api/webhooks/line` |
| Production | `https://api.sabaipics.com/api/webhooks/line` |

---

## Testing

```bash
# Run all tests
pnpm --filter=@sabaipics/api test:run

# Run only LINE webhook tests
pnpm --filter=@sabaipics/api test -- tests/line-webhook.test.ts
```

**Test coverage:**
- Valid signature acceptance
- Invalid signature rejection
- Tampered body detection
- Wrong channel secret rejection
- Empty events (verification request)
- Various event types (follow, message, unfollow)
- Edge cases (unicode, empty body, length mismatch)

---

## What's NOT Included (Out of Scope)

- Database tables (`participants.line_linked`, `line_notifications`)
- Push message utilities (`sendPushMessage()`, `buildImageCarousel()`)
- Application logic (actual send flow, friendship tracking)
- LINE client factory (will add when push messages needed)

---

## Next Steps

1. **Set webhook URL** in LINE Developers Console
2. **Test with ngrok** - Send test webhook from LINE Console
3. **Add database tables** - When ready for friendship tracking
4. **Add push message support** - Create `createLineClient()` factory

---

## References

- [LINE Messaging API Overview](https://developers.line.biz/en/docs/messaging-api/overview/)
- [LINE Webhook Events](https://developers.line.biz/en/docs/messaging-api/receiving-messages/)
- [LINE Signature Verification](https://developers.line.biz/en/docs/messaging-api/verify-webhook-signature/)
- `docs/tech/06_line_messaging.md` - Full design spec
