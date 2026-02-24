# TestFlight External Beta Review Notes (Staging) — Template

Paste the sections below into App Store Connect → TestFlight.

## Test Information (Beta App Description)

FrameFast Studio is the photographer capture companion for the FrameFast web platform (event photo distribution). It connects to supported cameras over local Wi‑Fi (PTP/IP) to download photos and upload them to our cloud storage for participant distribution.

This beta focuses on:

- Camera discovery and connection
- Photo ingestion (download from camera)
- Upload reliability when the camera’s Wi‑Fi has limited or no internet

Environment: Staging

Demo video (happy path):
https://drive.google.com/file/d/1TugCGs4w2ysmGst3sNiBEE3zQ2JYKgNK/view?usp=sharing

Supported camera hardware:

- Tested: Canon EOS 80D
- Validated models (hardware tested): Canon EOS 80D, Canon EOS R6 Mark II, Nikon Z6, Sony Alpha 7R IV (ILCE-7RM4)
- Additional supported models: Other Canon/Nikon/Sony models may work if they expose PTP/IP over Wi‑Fi, but compatibility can vary by model/firmware/settings.

Network prerequisites (important):

- Camera-hosted Wi‑Fi often has no internet.
- Real-time uploads are possible only if the iPhone still has an internet connection (usually cellular) while connected to the camera Wi‑Fi.
- If internet isn’t available, photos will still download and remain queued; uploads resume automatically when you’re back online.

Required permissions:

- Local Network: required (tap “Allow”) for camera discovery/connection.
- Camera: only required if using QR scan features (Sony flow).

Login (reviewer access):

- Email: testuser1+clerk_test@example.com
- OTP: <FILL IN> (we will provide this in TestFlight notes for review)

Support contact:

- Email: putto11262002@gmail.com
- When contacting support, include: iPhone model, iOS version, camera model/firmware (if applicable), and a screenshot of the blocking screen.

## What to Test

No camera required (reviewer fallback):

1. Launch the app and sign in using the credentials above.
2. While online, go to Profile → Legal and confirm “Terms of Service” and “Privacy Policy” open in-app.
3. Go to Capture → tap “+” → choose a brand (Canon/Nikon/Sony) → follow the on-screen setup steps → you will arrive at the “Connect camera” screen.
4. On “Connect camera”, iOS may prompt for Local Network access. Tap “Allow”.
5. If Local Network was previously denied, the app will show an “Allow Local Network access” screen with an “Open Settings” button.
6. With no camera present, discovery should fail gracefully (e.g., “No camera found”) and allow returning to the app (no crash, no infinite spinner).

With a compatible camera (preferred):

1. Join the camera’s Wi‑Fi network on the iPhone.
2. Return to FrameFast → connect to the camera (discovery should find it).
3. After the camera connects, an Event Picker sheet will appear. Select event: `FF PREVIEW EVENT`.
4. Start a capture session and take 1 photo on the camera.
5. Verify the app shows the photo downloaded, then confirm upload completion when the upload indicator reaches `1/1` and the photo row shows a green checkmark (see demo video for Canon EOS 80D).

If something blocks you:

- If Local Network was denied: enable it in iOS Settings for the app and retry.
- If camera Wi‑Fi has no internet: keep cellular enabled for real-time uploads; otherwise uploads can resume later.
