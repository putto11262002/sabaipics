# Canon Camera Integration - Technical Approach

**Last Updated:** 2026-01-08

---

## Use Case

Build a **mobile app (Android/iOS)** that:
- Connects to user's Canon camera via WiFi
- Automatically receives images when camera takes photo
- No complex camera control needed - **just image transfer**

---

## Initial Research Findings

### What We Initially Thought:
- Need to apply for Canon CCAPI SDK
- Each user's camera needs CCAPI activation (desktop tool)
- High friction for end users

### What We Discovered:
**Canon cameras have built-in WiFi modes that work without CCAPI activation!**

---

## Final Technical Approach

### Solution: Use PTP/IP Protocol

**PTP/IP** (Picture Transfer Protocol over IP) is:
- **Built into Canon cameras** - available via "Connect to smartphone" WiFi mode
- **No per-camera activation required** - works out of the box
- **Industry standard** - used by Lightroom, Capture One, Cascable, etc.
- **Supports image transfer** - exactly what we need

### How It Works

```
1. User: Camera Menu → WiFi → "Connect to smartphone"
2. Camera: Creates WiFi hotspot (or joins network)
3. App: Discovers camera via UPnP (Universal Plug and Play)
4. App: Connects using PTP/IP protocol
5. Camera: Takes photo → triggers ObjectAdded event
6. App: Receives image automatically
```

---

## Implementation Options

### Option 1: Use Existing Open Source Library (Recommended)

**libpict** - Most suitable for our needs
- **GitHub:** https://github.com/petabyt/libpict
- **Language:** C (works with Android/iOS)
- **License:** Apache 2.0 (commercial-friendly)
- **Canon Support:** ✅ Implements EOS/Canon vendor functionality
- **PTP/IP WiFi:** ✅ Working implementation
- **Platforms:** Tested on Android & iOS
- **Status:** Pre-release but functional (426+ commits)

**Why libpict:**
- Cross-platform (single codebase for Android + iOS)
- We can extract just the parts we need (image transfer)
- Active development
- Permissive license

### Option 2: Platform-Specific Libraries

**Android:**
- **ptplibrary** (Java) - https://github.com/laheller/ptplibrary
- Available via JitPack
- Early stage but functional

**iOS:**
- Reference **Cascable's open source components**
- CascableCore samples on GitHub

### Option 3: Get Official Canon SDK

**When to consider:**
- If we need guaranteed commercial licensing clarity
- If we want Canon's support
- If reverse-engineering concerns us legally

**Trade-offs:**
- ✅ Official documentation
- ✅ Clear licensing
- ✅ Canon support
- ❌ Application process required
- ❌ May have restrictions

---

## What We Need to Implement

Minimal PTP/IP functionality for image transfer:

### 1. Device Discovery
- Use UPnP to find Canon cameras on network
- Parse camera information

### 2. Connection & Pairing
- PTP/IP handshake
- Handle first-time pairing (user confirms on camera)
- Maintain connection session

### 3. Image Transfer
- Send GetObject command to retrieve images
- Handle image data streaming
- Parse JPEG/RAW formats

### 4. Event Monitoring
- Listen for ObjectAdded events (new photo taken)
- Trigger automatic download
- Handle connection state changes

**That's it!** We don't need full camera control, live view, or settings management.

---

## User Experience Flow

### First-Time Setup:
1. User opens app
2. App shows: "Go to Camera → WiFi → Connect to smartphone"
3. User selects WiFi mode on camera
4. App auto-discovers camera
5. User confirms pairing on camera (one-time)
6. Connected!

### Regular Use:
1. Camera and phone on same network
2. App auto-connects (no user action needed)
3. User takes photo → App receives automatically
4. Seamless experience

---

## Comparison: CCAPI vs PTP/IP

| Feature | CCAPI | PTP/IP (Built-in) |
|---------|-------|-------------------|
| Activation Required | ✅ Yes (desktop tool) | ❌ No |
| Works Out of Box | ❌ No | ✅ Yes |
| Image Transfer | ✅ Yes | ✅ Yes |
| WiFi Support | ✅ Yes | ✅ Yes |
| Mobile Platform | ✅ Yes | ✅ Yes |
| User Friction | High | Low |
| Best For | Developer tools | Consumer apps |

---

## Decision: Use PTP/IP with libpict

### Why This Approach:
1. ✅ **No activation friction** - works with any Canon camera with WiFi
2. ✅ **Cross-platform** - single approach for Android + iOS
3. ✅ **Proven technology** - used by major commercial apps
4. ✅ **Open source reference** - can start building immediately
5. ✅ **Just what we need** - image transfer, nothing more

### Risk Mitigation:
- **Legal:** Apache 2.0 license is commercial-friendly
- **If needed:** Can apply for Canon SDK later for official licensing
- **Fallback:** Multiple libraries available (ptplibrary, libgphoto2)

---

## Next Steps

### Phase 1: Proof of Concept
1. Clone libpict repository
2. Build basic Android/iOS test app
3. Test with Canon camera in "Connect to smartphone" mode
4. Verify image transfer works
5. Document any issues or limitations

### Phase 2: Evaluate SDK Need
After POC, decide if we need official Canon SDK based on:
- Commercial licensing concerns
- Feature limitations discovered
- Support requirements
- Legal review feedback

### Phase 3: Production Implementation
- Extract minimal PTP/IP code needed
- Optimize for mobile performance
- Add error handling and reconnection logic
- Polish user experience

---

## References

### Technical Documentation
- [Pairing and Initializing a PTP/IP Connection with a Canon EOS Camera](https://julianschroden.com/post/2023-05-10-pairing-and-initializing-a-ptp-ip-connection-with-a-canon-eos-camera/)
- [Remote Live View using PTP/IP on Canon EOS Cameras](https://julianschroden.com/post/2023-08-19-remote-live-view-using-ptp-ip-on-canon-eos-cameras/)
- [Picture Transfer Protocol - Wikipedia](https://en.wikipedia.org/wiki/Picture_Transfer_Protocol)

### Libraries
- [libpict - Picture Transfer Protocol client library](https://github.com/petabyt/libpict)
- [ptplibrary - PTP/IP and PTP/USB for Canon and Nikon](https://github.com/laheller/ptplibrary)
- [libgphoto2 - Camera access and control library](https://github.com/gphoto/libgphoto2)
- [Cascable - GitHub Organization](https://github.com/Cascable)

### Reference Apps
- [Cascable Canon WiFi Connection Guide](https://cascable.se/help/studio/canon-connection-guide/)
- [Canon Camera Connect App](https://www.usa.canon.com/mobile-apps/camera-connect)

### Canon Official Resources
- [Understanding Canon's EOS Digital SDK](https://www.canon-europe.com/pro/stories/eos-digital-sdk-explained/)
- [Camera API Package Overview](https://asia.canon/en/campaign/developerresources/camera/cap)

---

## Notes

- **No CCAPI activation needed** for basic image transfer
- **PTP/IP is the standard** used by professional apps like Lightroom and Capture One
- **User experience** is much better than CCAPI approach (no desktop activation)
- **SDK application** may still be valuable for official licensing, but not technically required
