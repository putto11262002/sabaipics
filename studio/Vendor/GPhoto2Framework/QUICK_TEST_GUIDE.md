# Quick Test Guide - Canon WiFi Event Detection

## 🚀 5-Minute Test Procedure

### Prerequisites (1 min)

1. Canon camera WiFi enabled (Settings → WiFi → Enable)
2. iPad connected to camera's WiFi network (Settings → WiFi → Select "EOS_XXXX")
3. GPhoto2Example app installed on iPad

### Basic Connection Test (2 min)

```
1. Launch GPhoto2Example on iPad
2. Verify IP shows: 192.168.1.1
3. Tap "Connect to Canon" button
4. Wait for status: "Connected" (green)
5. ✅ Connection successful!
```

### Event Detection Test (2 min)

```
1. Tap "Start Event Monitor" (green button)
2. Status changes to: "Monitoring Events" (blue)
3. Take a photo on camera
4. Watch for: "NEW PHOTO DETECTED!" in console
5. Check photo counter increments
6. ✅ Event detection working!
```

---

## 📱 What to Watch For

### On iPad Screen:

- **Status Label**: Disconnected → Connecting → Connected → Monitoring Events
- **Photo Count**: Should increment with each photo
- **Event Log**: Shows recent events with timestamps
- **Console Text**: Updates with photo details

### In Xcode Console:

```
=== NEW PHOTO DETECTED ===
File: IMG_1234.CR2
Folder: /store_00010001/DCIM/100CANON
Full Path: /store_00010001/DCIM/100CANON/IMG_1234.CR2
File size: 25165824 bytes (24.00 MB)
========================
```

---

## ⚡ Quick Troubleshooting

| Problem            | Solution                                                   |
| ------------------ | ---------------------------------------------------------- |
| Won't connect      | Check iPad is on camera WiFi                               |
| No events detected | Restart event monitor                                      |
| App crashes        | Check camera still connected                               |
| Wrong IP           | Camera might use different IP - check camera WiFi settings |

---

## 🎯 Success Criteria

- [x] App connects to Canon camera
- [x] Status shows "Connected" (green)
- [x] Can start event monitoring
- [x] Taking photo triggers "NEW PHOTO DETECTED"
- [x] Photo counter increments
- [x] Event log updates
- [x] Xcode console shows detailed logs

---

## 📝 Test Scenarios

### Scenario 1: Single Photo

1. Start monitoring
2. Take one photo
3. Verify detection
4. Stop monitoring

**Expected:** 1 photo detected

### Scenario 2: Burst Mode

1. Start monitoring
2. Take 5 photos quickly
3. Verify all detected

**Expected:** 5 photos detected

### Scenario 3: Long-Running Monitor

1. Start monitoring
2. Wait 2 minutes
3. Take photo
4. Verify still detecting

**Expected:** Event detected after long wait

---

## 🔧 Build & Deploy

### Build for Simulator:

```bash
cd /Users/putsuthisrisinlpa/Develope/company/products/sabaipics/agent6/GPhoto2Framework/GPhoto2Framework
xcodebuild -project GPhoto2Framework.xcodeproj \
  -scheme GPhoto2Example \
  -sdk iphonesimulator \
  -configuration Debug build
```

### Deploy to iPad:

1. Open in Xcode
2. Select target device: iPad (2)
3. Click Run (⌘R)
4. Watch console output

---

## 📊 Expected Console Output

### On Launch:

```
=== Canon EOS WiFi Test App Started ===
Camera IP: 192.168.1.1
Camera Model: Canon EOS (WLAN)
Protocol: ptpip
Connection String: ptpip:192.168.1.1
=====================================
```

### On Connection:

```
=== Starting Camera Connection ===
Found camera model at index: 12
Found port at index: 8
Camera initialized successfully!
Connected to: Canon EOS 5D Mark IV
Manufacturer: Canon Inc.
=== Connection Attempt Complete (return code: 0) ===
```

### On Photo Detection:

```
=== NEW PHOTO DETECTED ===
File: IMG_5678.CR2
Folder: /store_00010001/DCIM/100CANON
Full Path: /store_00010001/DCIM/100CANON/IMG_5678.CR2
File size: 28311552 bytes (27.00 MB)
========================
```

---

## 💡 Pro Tips

1. **Camera Sleep**: Keep camera awake during testing
2. **WiFi Range**: Stay within 5 meters for best results
3. **Console**: Always watch Xcode console for detailed logs
4. **Event Log**: UI shows last 5 events only - check console for all
5. **Restart**: If issues, restart app and camera WiFi

---

## 🎬 Demo Script

Use this for demonstrating the feature:

```
"Let me show you our Canon WiFi event detection system..."

[Open app on iPad]
"The app is pre-configured for Canon cameras at 192.168.1.1"

[Tap Connect]
"Connecting to the camera... and we're connected!"

[Tap Start Event Monitor]
"Now the system is monitoring for new photos in real-time"

[Take photo on camera]
"Watch this - when I take a photo on the camera..."
[Point to screen]
"The app immediately detects it! You can see the photo count
incremented and the event log shows exactly when it happened."

[Take another photo]
"It works for every photo - perfect for our event photography
workflow where we need to know immediately when new photos
are available."

[Show Xcode console]
"And for debugging, we have comprehensive logging showing
file names, sizes, and full paths."
```

---

## 📞 Need Help?

1. Check `CANON_WIFI_TEST_SETUP.md` for detailed documentation
2. Review Xcode console output
3. Verify camera WiFi settings
4. Test with different camera mode

---

**Last Updated:** 2026-01-14
**Status:** ✅ Ready for Testing
**Build:** Verified Success
