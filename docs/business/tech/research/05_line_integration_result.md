## 0. High-level: All relevant LINE integration surfaces

From LINE’s official developer and business docs, the main surfaces relevant to business/app integration are:

* **LINE Front-end Framework (LIFF)** – web apps running inside the LINE in-app browser. ([developers.line.biz][1])
* **LINE MINI App** – LIFF-based apps with extra platform features (discovery, service messages, quick-fill, home tab, etc.). ([developers.line.biz][2])
* **LINE Official Account (OA)** – business account + inbox + broadcast + CRM; basis for Messaging API billing. ([blog.cresclab.com][3])
* **LINE Messaging API (Bots)** – HTTPS API to send/receive messages, rich menus, Flex messages, beacons, etc. ([developers.line.biz][4])
* **LINE Login** – OAuth2/OIDC social login, free of charge. ([developers.line.biz][5])
* **LINE Notify** – one-way notification API **discontinued as of 31 Mar 2025**; LINE recommends Messaging API instead. ([notify-bot.line.me][6])
* **Rich menus** – persistent bottom menu UI attached to an OA, linkable to URLs/LIFF/bot actions. ([developers.line.biz][7])
* **Flex Messages** – highly structured, card-like message layouts for carousels/galleries, sent via Messaging API. ([developers.line.biz][8])
* **LINE Beacon** – triggers webhook events when users enter a beacon region. ([developers.line.biz][4])
* **Social plugins / “Add friend” buttons, share links** – web widgets to add OA or share content into LINE chats.
* **Service Messages / Official Notifications (for Mini Apps / enterprise)** – structured transactional notifications (e.g., reservation confirmation) using the Mini App “service message” API and some B2B “Official Notifications” programs. ([developers.line.biz][9])

Below, each major surface is treated as a “solution” and mapped to: what it is, capabilities, limitations, costs, DX, and typical use.

---

## 1. LIFF (LINE Front-end Framework)

### What is it?

* LIFF is a platform for **web apps hosted by you, rendered in LINE’s in-app browser** (LIFF browser). ([developers.line.biz][1])
* LIFF apps can obtain LINE user data (user ID, context), send messages on the user’s behalf (from the OA chat), and run as normal responsive web apps inside WKWebView/Android WebView. ([developers.line.biz][1])

### Capabilities (vs your requirements)

* **Camera/selfie access**

  * LIFF itself doesn’t provide a special camera API, but the LIFF browser supports **WebRTC/getUserMedia**; LINE Dev Thailand shows how to build a camera app inside LIFF using WebRTC. ([Medium][10])
  * On iOS/Android, `<input type="file" accept="image/*" capture>` or WebRTC works as in a typical mobile browser. ([Medium][10])

* **Photo display / gallery**

  * LIFF is just a web app; any HTML/CSS/JS UI for galleries or infinite scroll is possible. No documented special limitations beyond WebView constraints. ([developers.line.biz][1])

* **Downloads**

  * Image download is via standard web patterns (opening image URL, long-press save, or download links). No LINE-specific API; behavior follows WKWebView/Android WebView. ([developers.line.biz][1])

* **Push notifications**

  * LIFF itself doesn’t initiate push; instead:

    * Use **Messaging API** to send push / broadcast / narrowcast messages from OA. ([developers.line.biz][4])
    * Use `liff.sendMessages()` to send messages **from the user** to chats, mainly for share flows, not server push. ([developers.line.biz][11])

* **Deep linking / QR → specific event**

  * LIFF provides **permanent links** and can include query parameters (`liff.state`) to carry contextual data. ([developers.line.biz][1])
  * QR code can encode the LIFF URL with event ID; when opened, LIFF can parse query and call backend for that event.

* **Full screen UI**

  * LIFF supports view sizes `compact`, `tall`, and `full`; `full` makes the app almost full-screen with optional action button. ([developers.line.biz][1])

* **Offline support**

  * LIFF runs inside WKWebView/Android WebView; caching operated by HTTP `Cache-Control` headers; docs state there is **no API to explicitly clear LIFF cache**. ([developers.line.biz][1])
  * No first-class offline mode; you can use standard browser techniques (Service Worker/PWA) in theory, but behavior is constrained by the embedded webview and not officially guaranteed.

### Limitations

* **No background push** without a Messaging API / OA backend; LIFF is just the UI container. ([developers.line.biz][4])
* Some web APIs are unsupported in LIFF browser compared to external browsers (see “differences between LIFF browser and external browser”). ([developers.line.biz][1])
* `liff.sendMessages()` has constraints; e.g., it cannot be used after a LIFF app is reloaded via “recently used services”. ([developers.line.biz][1])

### Cost

* LIFF itself is **free**; charges arise only from:

  * Traffic on your servers/CDN.
  * Messages sent via OA / Messaging API, which are governed by OA plan (see OA section). ([developers.line.biz][4])

### Developer Experience

* JS SDK (`liff.init`, `liff.getContext`, `liff.getAccessToken`, etc.). ([developers.line.biz][11])
* Official tooling: LIFF Starter App, Create LIFF App CLI, LIFF CLI, LIFF Playground & LIFF Inspector. ([developers.line.biz][1])
* Extensive docs and examples (including Thai-localized content from LINE Dev TH). ([developers.line.biz][1])

### Use Cases / Market usage

* Official samples cover **reservations, membership cards, table ordering, self-checkout**, etc. ([developers.line.biz][1])
* In Thailand, many “LINE-native” CX flows (booking, coupons, loyalty) are LIFF-based behind OA menus or broadcast links.

---

## 2. LINE MINI App

### What is it?

* LINE MINI App is a **web application delivered via LINE** to provide lifestyle services; technically built on LIFF but with extra platform features (discovery, service messages, etc.). ([developers.line.biz][2])
* Focus is frictionless access: no install, simple activation inside LINE, repeat usage from home tab / OA / QR. ([developers.line.biz][2])

### Capabilities (vs requirements)

* **Camera/selfie access**

  * UI is still a LIFF app, so same WebRTC/getUserMedia and `<input type="file">` capabilities as LIFF. ([developers.line.biz][1])

* **Photo gallery / download**

  * Same as LIFF: full HTML/JS flexibility; service is just a branded “MINI App”. ([developers.line.biz][12])

* **Push notifications (Service Messages)**

  * MINI App provides **Service Messages**: you can issue a **service notification token** per user (with `liff.getAccessToken()`), then send **up to 5 service messages per token**, valid for 1 year; tokens are renewed as messages are sent. ([developers.line.biz][9])
  * Service messages can reach users who have NOT added your OA as friend, and are described as “sent free of charge” for service-related info such as order/reservation confirmation. ([developers.line.biz][2])
  * For high-volume or marketing-style pushes, you can still combine with OA + Messaging API.

* **Deep linking / event QR**

  * MINI App has **permanent links** and **Custom Path** features for deep-linking into specific screens or sessions. ([developers.line.biz][12])
  * QR codes can encode MINI App permanent URLs with event IDs; OA rich menu entries or broadcasts can open those as well.

* **Full screen UI**

  * MINI Apps are designed to appear as full-screen experiences within LINE with standardized safe areas and UI components. ([developers.line.biz][12])

* **Offline support**

  * Similar constraints as LIFF; guidelines emphasize performance and provide performance-tuning docs, but no dedicated offline mode beyond webview caching. ([developers.line.biz][12])

* **User profile quick-fill**

  * Verified MINI Apps can use **Common Profile Quick-fill** to auto-fill user profile fields (name, phone, etc.) via `liff.$commonProfile.get()`. ([developers.line.biz][9])

### Limitations

* MINI App programs are **curated**: require application, policy compliance, and review; they are not “self-serve” in all regions and verticals. ([developers.line.biz][12])
* Service message API imposes **strict constraints**: max 5 messages per token, one token per user per LIFF access token, and per-channel authorization. ([developers.line.biz][9])
* Not all OA + Messaging API features are automatically bundled; you may still need OA for marketing broadcast and CRM. ([developers.line.biz][12])

### Cost

* Documentation doesn’t publish public per-message prices for MINI App service messages; they are described as free. ([developers.line.biz][2])
* Commercial terms (if any) are usually part of business contracts with LINE in each market; you still pay for OA / Messaging API traffic according to your OA plan. ([developers.line.biz][13])

### Developer Experience

* Shares LIFF SDK; additional Mini App APIs (service messages, quick-fill, custom path, etc.). ([developers.line.biz][9])
* Has its own **Mini App Playground**, component library, and performance guidelines. ([developers.line.biz][12])

### Use Cases

* Official marketing focuses on **reservations, orders, membership, coupons, ticketing**; heavily used in Japan by transport, retail, and F&B sectors. ([developers.line.biz][2])
* For Thailand, adoption exists but detailed public case studies are limited in English; local agencies often promote “Mini App” as higher-end option vs pure LIFF.

---

## 3. LINE Official Account (OA)

### What is it?

* OA is the **business account** on LINE: inbox, chat UI, broadcast, rich menu, basic CRM, and entry point for Messaging API and LIFF/Mini App. ([developers.line.biz][4])
* Users interact via chat, follow the OA, receive broadcasts, and tap rich menu entries or message buttons that deep-link into LIFF/Mini App. ([developers.line.biz][4])

### Capabilities (vs requirements)

* **Camera/selfie** – OA itself is a chat entry; you can receive **image messages** and file uploads via Messaging API, but for selfie capture UX you normally jump from OA to **LIFF/Mini App**. ([developers.line.biz][4])
* **Photo gallery / download** – via Flex messages or plain image messages, but UX for browsing large galleries is limited compared to a full LIFF UI. ([developers.line.biz][4])
* **Push notifications** – Broadcast, narrowcast, and push messages through OA are the primary push surface, counted against your OA plan’s message quota. ([developers.line.biz][4])
* **Deep linking / QR to event** – OAs support QR codes that **add friend + open specific chat / link**; rich menus and messages can open external or LIFF URLs with parameters. ([developers.line.biz][7])

### Limitations

* OA chat UX is **linear** and text-oriented; not ideal for complex multi-photo galleries or camera flows without LIFF. ([developers.line.biz][4])
* Message quotas follow plan; exceeding quota blocks additional push/broadcast unless you pay extra (and free plan cannot send extra). ([developers.line.biz][13])

### Cost (Thailand, 2025)

Based on Thai martech sources summarizing LINE OA 2025 pricing: ([blog.cresclab.com][3])

* **Plans & quotas (THB / month)**

  * **Free plan**

    * Monthly fee: 0 THB
    * Broadcast messages: up to **300 messages / month**
    * Cannot send additional messages beyond quota
  * **Basic plan**

    * Monthly fee: **1,280 THB** (~**40 USD** at 31.96 THB/USD)
    * Broadcast messages: **15,000 / month**
    * Extra messages: **0.10 THB / message**
  * **Pro plan**

    * Monthly fee: **1,780 THB** (~**56 USD**)
    * Broadcast messages: **35,000 / month**
    * Extra messages: **0.06 THB / message**

* These quotas cover OA-sent messages (broadcast/push) including those sent via Messaging API; reply messages may not count toward the quota per Messaging API pricing rules. ([developers.line.biz][13])

### Developer Experience

* OA configuration via **LINE Official Account Manager** web UI; integrations via Messaging API and LIFF. ([developers.line.biz][7])
* Many Thai-specific guides and tools (CRM add-ons, automation platforms like Crescendo Lab) that extend OA segmentation, rich menu management, and deep-link tracking. ([blog.cresclab.com][3])

### Use Cases

* Primary channel for **marketing and service notifications** in Thailand; widely used across SME and enterprise. ([blog.cresclab.com][3])
* For event photo products, competitors’ “LINE Auto” features are described as sending photos **via customers’ LINE OA**. ([facebook.com][14])

---

## 4. LINE Messaging API / “LINE Bot”

### What is it?

* HTTP-based API that lets your **bot server receive webhooks and send messages** (reply / push / multicast / broadcast / narrowcast) via an OA. ([developers.line.biz][4])
* “LINE Bot” is usually just an OA configured with Messaging API and your server.

### Capabilities (vs requirements)

* **Camera/selfie**

  * Users can send **image messages** directly in chat; you can download those via the “Get content” endpoint. ([developers.line.biz][4])
  * To initiate a guided selfie capture flow, bots typically reply with a **LIFF link**; the actual camera handling is done in LIFF/Mini App.

* **Photo display / gallery**

  * Supports **image messages, image carousels, template messages, Flex messages**, which can render photo cards and small galleries inside chat. ([developers.line.biz][4])

* **Push notifications**

  * Supports **push, multicast, broadcast, narrowcast** message types counted against OA plan. ([developers.line.biz][13])
  * Webhooks are used for events (message, follow, postback, beacon, etc.). ([developers.line.biz][4])

* **Deep linking / QR**

  * You can send messages containing **URI actions** that open LIFF URLs or external URLs; rich menus use `uri` actions as well. ([developers.line.biz][7])

* **Full screen UI / offline**

  * UI is chat-based; full screen experiences are via LIFF/Mini App the bot opens or links to.

### Limitations

* Messaging API **cannot directly access device hardware** (camera, storage); it only deals with content uploaded via chat or LIFF. ([developers.line.biz][4])
* Message volume is limited by OA plan and message counting rules (push/multicast/broadcast counted; reply not). ([developers.line.biz][13])

### Cost

* Messaging API itself is **free to use**; charges are entirely determined by OA subscription & per-message pricing per region. ([developers.line.biz][4])

### Developer Experience

* REST API with detailed docs, SDKs, and tools (LINE Bot Designer, Flex Message Simulator). ([developers.line.biz][4])
* Strong ecosystem in Thailand: many vendors (including Pixid and SiKram) clearly build on top of OA + Messaging API.

### Use Cases

* Chatbots, notification bots, transactional alerts, customer support automation, and multi-step conversational flows. ([developers.line.biz][4])

---

## 5. LINE Login

### What is it?

* Social login service letting users sign into your service with their LINE account; **free of charge**. ([developers.line.biz][5])
* Based on OAuth 2.0 + OpenID Connect; supports web, native apps, Unity, Flutter. ([developers.line.biz][5])

### Capabilities (vs requirements)

* **User identity / backend integration**

  * Provides access tokens and ID tokens with user ID, display name, avatar URL, etc. ([developers.line.biz][5])
  * Can be used for account linking between your backend and LINE account (or in combination with Messaging API’s account linking). ([developers.line.biz][4])

* **Camera, gallery, download, push**

  * LINE Login doesn’t provide UI; it’s only authentication. Camera/gallery/download come from LIFF/web app; push from OA/Messaging API.

* **QR-based login**

  * For web, one of the supported auth methods is **QR code login** (user scans QR shown on web login page with LINE app). ([developers.line.biz][5])

### Limitations

* Does not replace OA or Messaging API; it only solves **identity & login**.
* Requires users to have LINE and be willing to grant login permissions.

### Cost & DX

* Free; only your infrastructure and potential OA costs apply. ([developers.line.biz][5])
* Official SDKs for multiple platforms; good docs and security guidelines (including optional 2FA requirement). ([developers.line.biz][5])

### Use Cases

* Single sign-on for external sites, membership/loyalty systems, and advanced personalization based on LINE profile.

---

## 6. LINE Notify (legacy)

### What is/was it?

* Service that allowed services to send simple notification messages into LINE (typically to a user’s chat) with a dedicated “LINE Notify” account. ([notify-bot.line.me][6])

### Current status & relevance

* Official notice: **service ended on March 31, 2025**; LINE explicitly recommends using **Messaging API via OA** instead. ([notify-bot.line.me][6])
* For a new product in late 2025, LINE Notify is **not a viable option**; all notification flows should target Messaging API (and/or Mini App service messages). ([notify-bot.line.me][6])

---

## 7. Rich Menus & Flex Messages

### Rich Menus

* Persistent menu bar under OA chat; configured via OA Manager or Messaging API. ([developers.line.biz][7])
* Each tappable area can trigger actions: **open URL (LIFF/external), send postback, switch menu**, etc. ([developers.line.biz][7])

**Capabilities vs flow**

* **QR → event**: user adds OA via QR; rich menu item “View my photos” can open LIFF URL containing event ID or user session ID. ([developers.line.biz][7])
* **Entry point for camera / gallery**: menu can launch LIFF/Mini App that handles selfie capture and gallery.
* **Personalization**: per-user rich menus supported via Messaging API, so you can adjust menu options based on event state or registration. ([developers.line.biz][7])

### Flex Messages

* JSON-defined rich message layout: cards, carousels, images, buttons; rendered in chat. ([developers.line.biz][8])
* Sent via reply/push/broadcast through Messaging API; layout preview via Flex Message Simulator. ([developers.line.biz][8])

**Capabilities vs flow**

* **Photo gallery**: good for **structured carousels** (e.g. “Top 4 photos”, paginated via buttons).
* **Deep linking**: buttons within Flex cards can have `uri` actions linking to LIFF gallery pages or specific photo sets. ([developers.line.biz][8])

---

## 8. Other LINE platform features relevant to you

### LINE Beacon

* Allows OA + bot to react when a user’s device enters a beacon region; event is delivered to Messaging API webhook. ([developers.line.biz][4])
* Potential future extension: **on-site check-in** or context when near a photo booth, but not required for core flow.

### Social Plugins (Add Friend / Share buttons)

* Web widgets to **add OA** or share URLs into LINE chats from your external web pages/landing pages.
* For your QR entry, less central, but relevant if you have web pages promoting events.

### Official Notifications / Enterprise programs

* Outside standard developer docs, LINE offers enterprise “Official Notifications” or enhanced messaging programs (e.g., banks, utilities) with higher delivery guarantees; these are typically negotiated and not self-serve.
* For your scale tiers (up to 100k participants/month), standard OA + Messaging API + possibly Mini App service messages should suffice; enterprise programs might become relevant if you scale into regulated sectors.

---

## 9. Capability matrix vs your requirements

### 9.1 Camera & gallery

| Option                  | Direct camera access?                                                      | Best practice for your flow                                      |
| ----------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| LIFF web app            | Yes, via WebRTC/getUserMedia & file input. ([Medium][10])                  | Implement selfie capture + gallery in LIFF; opened from OA/QR.   |
| LINE MINI App           | Same as LIFF (web tech). ([developers.line.biz][9])                        | MINI App frontend identical to LIFF; adds service messages, etc. |
| OA + Messaging API only | No (only receives images users upload in chat). ([developers.line.biz][4]) | Can accept user-sent photos, but no guided camera UI.            |
| LINE Login              | No UI.                                                                     | Used only for auth if needed.                                    |

### 9.2 Push notifications & cost

| Option             | Push mechanism                                                                         | Costs (TH, 2025)                                                                                                           |
| ------------------ | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| OA + Messaging API | Broadcast/push/multicast/narrowcast. ([developers.line.biz][4])                        | 0–300 msgs free (Free plan), then 1,280–1,780 THB/mo for 15k–35k msgs; overage 0.10–0.06 THB/msg. ([blog.cresclab.com][3]) |
| MINI App           | Service messages (up to 5 per user per token, 1-year). ([developers.line.biz][9])      | Described as free; still need OA for broader pushes and may incur OA costs.                                                |
| LINE Notify        | Was a simple notification API; **discontinued 31 Mar 2025**. ([notify-bot.line.me][6]) | Not available for new integrations; Messaging API recommended instead.                                                     |

### 9.3 Deep linking / QR → specific event

| Option          | Mechanism                                                                                                                 |
| --------------- | ------------------------------------------------------------------------------------------------------------------------- |
| LIFF / MINI App | LIFF URL / MINI App permanent links with query parameters (`liff.state`, custom path). ([developers.line.biz][1])         |
| OA              | QR codes to add OA and open chat; messages & rich menus can contain LIFF/URL links. ([developers.line.biz][7])            |
| Messaging API   | Sends messages containing `uri` actions, buttons, Flex cards linking to LIFF or external URLs. ([developers.line.biz][7]) |

---

## 10. Competitor intelligence (Pixid, SiKram)

### Pixid – “Pixid LINE Auto”

Evidence from Pixid’s own Thai Facebook posts:

* Pixid markets **“Pixid LINE Auto”** as a package where event guests **scan their face and then receive photos via LINE**. ([facebook.com][15])
* Another post mentions that for those already using **LINE OA**, “LINE Auto can be adjusted so that instead of the line pixid account sending photos, the photographer’s or customer’s own LINE Official Account sends the photos”. ([facebook.com][14])

From this, the most consistent interpretation:

* Pixid uses customers’ **LINE Official Account + some automation** that sends image messages (likely via Messaging API) once the guest’s face is matched.
* Flow appears to be “scan QR / register / face recognition / auto send via OA”, aligning with an OA + Messaging API + (likely) LIFF or web registration front-end pattern.

### SiKram

From SiKram’s promotional content (Thai language):

* SiKram advertises itself as **“ไม่ใช่แค่ระบบ QR Code แต่นี่คือเทคโนโลยีค้นหารูปอัจฉริยะ – ค้นหาด้วยใบหน้า ส่งรูปให้อัตโนมัติ”** – QR + intelligent face search + auto sending images. ([facebook.com][16])
* Their posts reference **LINE as the delivery channel**, with messaging that users receive photos automatically via LINE after registration.

Given this:

* SiKram likely uses a similar **OA + Messaging API** pattern, with either a LIFF or standard web front-end for face enrollment and gallery browsing, and OA messages for photo delivery.
* Public docs do not expose their internal architecture; the conclusion is based on how LINE integrations normally work plus their marketing language.

---

## 11. Integration considerations (how pieces connect)

This section maps each LINE feature to your system components (no recommendations, just possibilities).

### 11.1 API backend & identity

* **Identity options**

  * Use **LINE Login** or LIFF’s `getContext`/`getAccessToken` to tie a LINE user ID to your internal user or “event participant” record. ([developers.line.biz][11])
  * Messaging API account linking can also connect a LINE user to your internal account if needed. ([developers.line.biz][4])

* **State passing**

  * Event IDs and session tokens can be passed in LIFF/Mini App URLs (query params) and stored in your backend; the LINE user ID becomes the stable key for notifications.

### 11.2 Face capture flow

* **Camera**:

  * Implemented in **LIFF or MINI App** via WebRTC or file input; the app posts captured photo to your backend for face embedding and matching. ([Medium][10])

* **No app install**:

  * Achieved by staying inside LINE (LIFF/Mini App) opened through OA link or QR; docs emphasize that Mini Apps avoid extra downloads and sign-ups. ([developers.line.biz][2])

### 11.3 Notifications (“your photos are ready”)

* **Transactional / per-participant updates**:

  * **Messaging API push** from OA to the user’s LINE ID.
  * **Mini App service messages** for specific sessions (up to 5 per user per token, no need for them to have added OA). ([developers.line.biz][9])

* **Cost behavior**:

  * Message count determines cost; at Tier 3 (100k participants/month), the combination of plan quotas and price per extra message must be evaluated against how many messages per participant you intend to send.

### 11.4 Gallery display & performance

* **Inside chat**:

  * Flex carousels via Messaging API for quick “top N photos” snapshots. ([developers.line.biz][8])

* **In app view (LIFF/Mini App)**:

  * Use lazy loading, pagination, and CDN hosting for photos; LINE docs provide general performance guidelines for LIFF/Mini App but no hard limits on payload beyond normal web concerns. ([developers.line.biz][1])

### 11.5 QR flow / deep linking

* **Event QR**:

  * Encode either **LIFF URL** (with event ID) or **OA add-friend link + postback** that opens LIFF; both patterns are supported. ([developers.line.biz][1])

---

## 12. Solutions found (catalog)

Below is a neutral catalog of concrete “solutions” (integration building blocks) derived from the research:

| Solution / Pattern                         | Category                    | Notes                                                                                                                      |
| ------------------------------------------ | --------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| LIFF web app opened from OA rich menu / QR | LIFF + OA + Messaging API   | In-LINE web UI for selfie + gallery; OA + Messaging API for messages & QR entry. ([developers.line.biz][1])                |
| LINE MINI App with service messages        | LINE MINI App + OA          | LIFF-based UI + service messages (up to 5 per user) + optional OA push for marketing. ([developers.line.biz][2])           |
| Pure OA chatbot + Media upload             | OA + Messaging API          | Guests send selfies and receive photos entirely via chat; no LIFF UI. ([developers.line.biz][4])                           |
| OA + Flex gallery pushes                   | Messaging API + Flex        | Bot pushes Flex carousels with selected photos and deep links to full gallery. ([developers.line.biz][8])                  |
| OA + LIFF + LINE Login                     | OA + LIFF + LINE Login      | LINE Login or LIFF tokens used for stronger account identity (multi-device, web). ([developers.line.biz][11])              |
| MINI App + Official Website crossover      | MINI App + external web     | MINI App UI reused as web app (per docs), letting users access gallery outside LINE if needed. ([developers.line.biz][12]) |
| OA + Beacon triggers (on-site only)        | OA + Messaging API + Beacon | Beacons trigger webhooks (“user is near booth”), could auto-open LIFF/gallery messages. ([developers.line.biz][4])         |
| Social plugin “Add friend” + web gallery   | Social plugin + OA          | External event site uses “Add friend” + share to bring users into OA/LIFF flow. ([developers.line.biz][4])                 |

---

## 13. Open questions emerging from research

These are questions that the public docs do not fully answer and would likely need direct confirmation from LINE or a Thai partner:

1. **Mini App availability & program rules for Thailand**

   * Exact onboarding criteria, review timeline, and whether photo-distribution as a vertical has any special policy constraints (e.g., content moderation, privacy).

2. **Service message volume & usage constraints for MINI App**

   * Beyond the documented “5 per token per year” limit, whether there are global caps per user/app or commercial thresholds at large scales (e.g., 100k monthly users). ([developers.line.biz][9])

3. **Exact Thai pricing for high-volume Messaging API use**

   * Public docs show plan tiers and per-message costs, but not detailed discounts/tiers for very high monthly message counts; local sales or partners might offer different commercial terms. ([blog.cresclab.com][3])

4. **Policy constraints on face recognition & biometric data**

   * LINE platform docs do not explicitly address biometric processing by third-party LIFF/Mini Apps; compliance with Thai PDPA and LINE’s platform policies likely imposes additional requirements (privacy notice, consent flows, data retention). ([developers.line.biz][12])

5. **Competitors’ exact architecture**

   * Pixid and SiKram marketing strongly imply OA + Messaging API flows, but there is no fully detailed public technical documentation. Deeper competitive analysis would require direct product use or vendor discussion. ([facebook.com][15])


[1]: https://developers.line.biz/en/docs/liff/overview/ "LINE Front-end Framework (LIFF) | LINE Developers"
[2]: https://developers.line.biz/en/services/line-mini-app/ "LINE Developers"
[3]: https://blog.cresclab.com/th/line-oa-price "อัปเดตปี 2025 ราคา LINE OA แพงขึ้นไหม? ค่าใช้จ่ายมีอะไรบ้าง?"
[4]: https://developers.line.biz/en/docs/messaging-api/overview/ "Messaging API overview | LINE Developers"
[5]: https://developers.line.biz/en/docs/line-login/overview/ "LINE Login overview | LINE Developers"
[6]: https://notify-bot.line.me/ "LINE Notify"
[7]: https://developers.line.biz/en/docs/messaging-api/using-rich-menus/ "Use rich menus | LINE Developers"
[8]: https://developers.line.biz/en/docs/messaging-api/using-flex-messages/ "Send Flex Messages | LINE Developers"
[9]: https://developers.line.biz/en/reference/line-mini-app/ "LINE MINI App API reference | LINE Developers"
[10]: https://medium.com/linedevth/%E0%B8%AA%E0%B8%A3%E0%B9%89%E0%B8%B2%E0%B8%87%E0%B9%81%E0%B8%AD%E0%B8%9B%E0%B8%96%E0%B9%88%E0%B8%B2%E0%B8%A2%E0%B8%A3%E0%B8%B9%E0%B8%9B%E0%B8%9A%E0%B8%99-liff-app-%E0%B9%84%E0%B8%94%E0%B9%89%E0%B9%81%E0%B8%A5%E0%B9%89%E0%B8%A7-%E0%B8%94%E0%B9%89%E0%B8%A7%E0%B8%A2%E0%B9%80%E0%B8%97%E0%B8%84%E0%B9%82%E0%B8%99%E0%B9%82%E0%B8%A5%E0%B8%A2%E0%B8%B5-webrtc-46831437b5e9 "สร้างแอปถ่ายรูปบน LIFF app ได้แล้ว ด้วยเทคโนโลยี WebRTC | by Jirawatee | LINE Developers Thailand | Medium"
[11]: https://developers.line.biz/en/reference/liff/ "LIFF v2 API reference | LINE Developers"
[12]: https://developers.line.biz/en/docs/line-mini-app/ "LINE MINI App | LINE Developers"
[13]: https://developers.line.biz/en/docs/messaging-api/pricing/ "Messaging API pricing | LINE Developers"
[14]: https://www.facebook.com/pixidapp/posts/%E0%B8%AA%E0%B8%B3%E0%B8%AB%E0%B8%A3%E0%B8%B1%E0%B8%9A%E0%B8%84%E0%B8%99%E0%B8%97%E0%B8%B5%E0%B9%88%E0%B9%83%E0%B8%8A%E0%B9%89-line-oa-line-auto-%E0%B8%AA%E0%B8%B2%E0%B8%A1%E0%B8%B2%E0%B8%A3%E0%B8%96%E0%B8%9B%E0%B8%A3%E0%B8%B1%E0%B8%9A-%E0%B8%88%E0%B8%B2%E0%B8%81%E0%B8%9B%E0%B8%81%E0%B8%95%E0%B8%B4%E0%B8%97%E0%B8%B5%E0%B9%88-line-pixid-%E0%B9%80%E0%B8%9B%E0%B9%87%E0%B8%99%E0%B8%95%E0%B8%B1%E0%B8%A7%E0%B8%AA%E0%B9%88%E0%B8%87%E0%B8%A3%E0%B8%B9%E0%B8%9B-/721563650659190/?utm_source=chatgpt.com "สำหรับคนที่ใช้ line OA , line auto สามารถปรับ จากปกติที่ line pixid ..."
[15]: https://www.facebook.com/pixidapp/posts/package-%E0%B9%83%E0%B8%AB%E0%B8%A1%E0%B9%88%E0%B8%88%E0%B8%B2%E0%B8%81-pixid-%E0%B8%9A%E0%B8%A3%E0%B8%B4%E0%B8%81%E0%B8%B2%E0%B8%A3-pixid-line-auto-%E0%B8%A3%E0%B8%B0%E0%B8%9A%E0%B8%9A%E0%B8%97%E0%B8%B5%E0%B9%88%E0%B9%83%E0%B8%AB%E0%B9%89%E0%B9%81%E0%B8%82%E0%B8%81%E0%B9%83%E0%B8%99%E0%B8%87%E0%B8%B2%E0%B8%99%E0%B8%AA%E0%B9%81%E0%B8%81%E0%B8%99%E0%B9%83%E0%B8%9A%E0%B8%AB%E0%B8%99%E0%B9%89%E0%B8%B2%E0%B9%81%E0%B8%A5%E0%B9%89%E0%B8%A7%E0%B8%A3%E0%B8%AD%E0%B8%A3/700488509433371/?utm_source=chatgpt.com "package ใหม่จาก pixid บริการ pixid line auto ระบบที่ให้แขกในงาน ..."
[16]: https://www.facebook.com/sikram.co/posts/%E0%B9%83%E0%B8%AB%E0%B8%A1%E0%B9%88%E0%B8%A3%E0%B8%B1%E0%B8%9A%E0%B8%A3%E0%B8%B9%E0%B8%9B%E0%B8%AD%E0%B8%B1%E0%B8%95%E0%B9%82%E0%B8%99%E0%B8%A1%E0%B8%B1%E0%B8%95%E0%B8%B4%E0%B8%9C%E0%B9%88%E0%B8%B2%E0%B8%99-line-%E0%B9%84%E0%B8%A1%E0%B9%88%E0%B8%9E%E0%B8%A5%E0%B8%B2%E0%B8%94%E0%B8%97%E0%B8%B8%E0%B8%81%E0%B8%A0%E0%B8%B2%E0%B8%9E%E0%B8%AA%E0%B8%B3%E0%B8%84%E0%B8%B1%E0%B8%8D-%E0%B8%84%E0%B9%89%E0%B8%99%E0%B8%AB%E0%B8%B2%E0%B8%A3%E0%B8%B9%E0%B8%9B%E0%B9%84%E0%B8%A1%E0%B9%88%E0%B9%80%E0%B8%88%E0%B8%AD-%E0%B9%84%E0%B8%A1%E0%B9%88%E0%B8%95%E0%B9%89%E0%B8%AD%E0%B8%87%E0%B9%80%E0%B8%AA%E0%B8%B5%E0%B8%A2%E0%B9%80%E0%B8%A7%E0%B8%A5%E0%B8%B2-%E0%B8%A3/122180152814117722/?utm_source=chatgpt.com "ใหม่!รับรูปอัตโนมัติผ่าน LINE ไม่พลาดทุกภาพสำคัญ 🔍 ค้นหา ..."
