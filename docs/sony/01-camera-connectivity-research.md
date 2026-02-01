# Sony Alpha Camera App & Connectivity Research

## Executive Summary

Comprehensive analysis of Sony Alpha camera series (A7, A7R, A7S) focusing on:

- Smartphone app ecosystem (PlayMemories Mobile → Imaging Edge Mobile → Creators' App)
- WiFi connection methods (QR code, NFC, Bluetooth pairing)
- WiFi support across all models
- Bluetooth Low Energy (BLE) handshake protocol analysis
- Comparison of connection methods across model generations

**Research Date**: February 1, 2026

---

## 1. Camera Line Research by Model

### 1.1 Sony Alpha 7 (Base Models)

| Camera Model               | Model ID       | App Used                                       | WiFi Support | Official Manual URL                                        | Notes                                                       |
| -------------------------- | -------------- | ---------------------------------------------- | ------------ | ---------------------------------------------------------- | ----------------------------------------------------------- |
| **Sony A7 (ILCE-7)**       | gbmig/44840601 | PlayMemories Mobile                            | ✅ Yes       | https://helpguide.sony.net/gbmig/44840601/v1/th/index.html | Shares manual with A7R                                      |
| **Sony A7 II (ILCE-7M2)**  | 1450           | PlayMemories Mobile                            | ✅ Yes       | https://helpguide.sony.net/ilc/1450/v1/th/index.html       | Uses NFC One-touch connection                               |
| **Sony A7 III (ILCE-7M3)** | 1720           | Imaging Edge Mobile                            | ✅ Yes       | https://helpguide.sony.net/ilc/1720/v1/th/index.html       | First to use Imaging Edge Mobile                            |
| **Sony A7 IV (ILCE-7M4)**  | 2110           | Creators' App (fw 2.00+) / Imaging Edge Mobile | ✅ Yes       | https://helpguide.sony.net/ilc/2110/v1/th/index.html       | Creators' App for firmware Ver.2.00 or later                |
| **Sony A7 V (ILCE-7M5)**   | 2540           | Creators' App                                  | ✅ Yes       | https://helpguide.sony.net/ilc/2540/v1/th/index.html       | Newest model; QR code only for app download, NOT connection |

**Source**: Sony Help Guides - https://helpguide.sony.net/

### 1.2 Sony Alpha 7R (High-Resolution Models)

| Camera Model                   | Model ID       | App Used            | WiFi Support | Official Manual URL                                        | Notes                               |
| ------------------------------ | -------------- | ------------------- | ------------ | ---------------------------------------------------------- | ----------------------------------- |
| **Sony A7R (ILCE-7R)**         | gbmig/44840601 | PlayMemories Mobile | ✅ Yes       | https://helpguide.sony.net/gbmig/44840601/v1/th/index.html | Shares manual with A7               |
| **Sony A7R II (ILCE-7RM2)**    | 1520           | PlayMemories Mobile | ✅ Yes       | https://helpguide.sony.net/ilc/1520/v1/th/index.html       | Uses NFC One-touch connection       |
| **Sony A7R III (ILCE-7RM3)**   | 1710           | Imaging Edge Mobile | ✅ Yes       | https://helpguide.sony.net/ilc/1710/v1/th/index.html       | First to use Imaging Edge Mobile    |
| **Sony A7R IIIA (ILCE-7RM3A)** | 2050           | Imaging Edge Mobile | ✅ Yes       | https://helpguide.sony.net/ilc/2050/v1/th/index.html       | Updated version of 7RM3             |
| **Sony A7R IV (ILCE-7RM4)**    | 1930           | Imaging Edge Mobile | ✅ Yes       | https://helpguide.sony.net/ilc/1930/v1/th/index.html       | **Has QR Code iPhone/iPad control** |
| **Sony A7R IVA (ILCE-7RM4A)**  | 2060           | Imaging Edge Mobile | ✅ Yes       | https://helpguide.sony.net/ilc/2060/v1/th/index.html       | Updated version of 7RM4             |
| **Sony A7R V (ILCE-7RM5)**     | 2230           | Creators' App       | ✅ Yes       | https://helpguide.sony.net/ilc/2230/v1/th/index.html       | Newest high-res model               |

**Source**: Sony Help Guides - https://helpguide.sony.net/

### 1.3 Sony Alpha 7S (Low-Light/Video Models)

| Camera Model                 | Model ID | App Used            | WiFi Support | Official Manual URL                                  | Notes                             |
| ---------------------------- | -------- | ------------------- | ------------ | ---------------------------------------------------- | --------------------------------- |
| **Sony A7S (ILCE-7S)**       | 1420     | PlayMemories Mobile | ✅ Yes       | https://helpguide.sony.net/ilc/1420/v1/th/index.html | Uses PlayMemories Mobile with NFC |
| **Sony A7S II (ILCE-7SM2)**  | 1530     | PlayMemories Mobile | ✅ Yes       | https://helpguide.sony.net/ilc/1530/v1/th/index.html | NFC One-touch remote connection   |
| **Sony A7S III (ILCE-7SM3)** | 2010     | Imaging Edge Mobile | ✅ Yes       | https://helpguide.sony.net/ilc/2010/v1/th/index.html | Transition to Imaging Edge Mobile |

**Source**: Sony Help Guides - https://helpguide.sony.net/

---

## 2. App Ecosystem Evolution

### 2.1 Timeline and Features

| App                     | Years Used   | Connection Method    | QR Code WiFi?                    | WiFi Required for Control?    |
| ----------------------- | ------------ | -------------------- | -------------------------------- | ----------------------------- |
| **PlayMemories Mobile** | 2013-2014    | NFC One-touch        | ❌ No (uses NFC)                 | ✅ Yes                        |
| **Imaging Edge Mobile** | 2018-2020    | QR Code Scanning     | ✅ Yes                           | ✅ Yes                        |
| **Creators' App**       | 2021-Present | Bluetooth LE Pairing | ❌ No (QR for app download only) | ✅ Yes (via BLE-managed WiFi) |

### 2.2 PlayMemories Mobile (2013-2014)

**Supported Cameras**:

- A7, A7R (first generation)
- A7 II, A7R II
- A7S, A7S II

**Connection Method**:

- NFC One-touch pairing
- WiFi Direct with SSID/password entry
- No QR code support

**Official App**: Sony PlayMemories Mobile (discontinued)

### 2.3 Imaging Edge Mobile (2018-2020)

**Supported Cameras**:

- A7 III, A7R III, A7S III
- A7R IV, A7R IVA

**Connection Method**:

- QR Code scanning for WiFi credentials
- Camera displays QR code containing SSID and password
- Phone scans QR code → automatically connects to camera's WiFi Direct hotspot
- No manual SSID/password entry required

**QR Code Example**:

- A7R IV iPhone/iPad control: https://helpguide.sony.net/ilc/1930/v1/th/contents/TP0002723568.html

**Official App**: Sony Imaging Edge Mobile (discontinued for newer cameras)

### 2.4 Creators' App (2021-Present)

**Supported Cameras**:

- A7 IV (firmware 2.00+)
- A7R V
- A7 V

**Connection Method**:

- Bluetooth Low Energy (BLE) pairing for device authorization
- Automatic WiFi connection established via BLE handshake
- No QR code for WiFi connection
- QR code only used for initial app download/installation

**Bluetooth Pairing Flow** (from A7 IV manual):

1. Camera: MENU → Network → Connect to smartphone → Connect smartphone
2. Camera: Set Bluetooth function to [On]
3. Camera displays "waiting for connection" screen
4. Phone: Open Creators' App
5. Phone: Follow on-screen prompts to pair via Bluetooth
6. Camera: Shows confirmation when connected
7. Phone: Select camera function from menu

**Official App**: Sony Creators' App

**Source**: https://www.sony.net/ca/

---

## 3. WiFi Connection Method Comparison

### 3.1 Imaging Edge Mobile vs Creators' App

| Aspect                 | Imaging Edge Mobile (QR Code) | Creators' App (BLE)                        |
| ---------------------- | ----------------------------- | ------------------------------------------ |
| **WiFi Credentials**   | **In QR code** (auto-scan)    | **Manual entry required** on both devices  |
| **Network to Connect** | Camera's WiFi Direct hotspot  | Same router/access point on BOTH devices   |
| **Setup Difficulty**   | Easy (one scan)               | More complex (manual network config)       |
| **Connection Speed**   | Immediate after QR scan       | Requires BLE handshake + manual WiFi setup |
| **Reconnection**       | Re-scan QR code               | BLE maintains trust, WiFi auto-reconnects  |
| **Bluetooth Used**     | No (or optional NFC)          | **Required** for pairing and WiFi setup    |

### 3.2 Detailed Flow Comparison

#### Imaging Edge Mobile Flow (QR Code)

```
1. Camera displays QR code with SSID and password
2. User opens Imaging Edge Mobile on phone
3. User taps "Scan QR Code of camera"
4. Phone scans QR code
5. Phone automatically connects to camera's WiFi Direct hotspot (SSID: DIRECT-xxxx)
6. Remote control enabled immediately
```

#### Creators' App Flow (BLE + WiFi)

```
1. Bluetooth Low Energy Pairing:
   - Camera: MENU → Network → Connect to smartphone
   - Camera: Set Bluetooth function to [On]
   - Phone: Open Creators' App
   - Both: Complete BLE pairing on-screen prompts
   - Result: Trust relationship established

2. WiFi Connection (separate step):
   - Both camera and phone must connect to SAME WiFi access point
   - Camera: MENU → Network → Wi-Fi → Connect Wi-Fi → On
   - Phone: Select same router network from WiFi settings
   - Phone: Connect to camera from Creators' App
   - Result: WiFi connection established for remote control
```

### 3.3 Is WiFi Required for Remote Control?

**YES** - WiFi is **required** for remote control in Creators' App.

**Why WiFi is Required** (even after BLE pairing):

- **Remote shooting** (live view, shutter control, settings adjustments)
- **Image/video transfer** from camera to smartphone
- **Live streaming** capabilities
- **High-resolution live view** streaming

**What BLE Alone Does**:

- Initial pairing/trust relationship between camera and phone
- Automatic WiFi connection establishment (BLE "handshake")
- WiFi credential exchange
- Connection maintenance and reconnection
- Device discovery and wake-up

**Third-Party Bluetooth Remotes**:
Devices like JJC, Godox can trigger shutter over BLE because they implement basic remote trigger protocols. However, **Sony's Creators' App** needs WiFi bandwidth for full remote control features including live view and settings control, which BLE cannot support due to bandwidth limitations.

**Source**: Sony A7 IV Manual - https://helpguide.sony.net/ilc/2110/v1/th/contents/TP1000660998.html

---

## 4. Bluetooth Low Energy (BLE) Protocol Analysis

### 4.1 Problem Statement

**Imaging Edge Mobile**: QR code contains SSID/password, user scans → connects. Simple, documented.

**Creators' App**: BLE handshake exchanges credentials → auto-connects. Complex, undocumented.

**Challenge**: Sony's BLE protocol for WiFi credential exchange is proprietary and not publicly documented.

### 4.2 Protocol Stack Breakdown

| Layer       | Protocol Type                    | Standard?                     | Sony's Implementation         |
| ----------- | -------------------------------- | ----------------------------- | ----------------------------- |
| **Layer 1** | Bluetooth Low Energy             | ✅ Standard (documented)      | Uses standard Bluetooth chip  |
| **Layer 2** | GATT (Generic Attribute Profile) | ✅ Standard (documented)      | Uses standard GATT framework  |
| **Layer 3** | Sony WiFi Credential Protocol    | ❌ PROPRIETARY (undocumented) | Custom Sony-specific services |

### 4.3 Bluetooth Low Energy (Layer 1)

**Standard**: Bluetooth Low Energy (BLE) specification

- Also known as: Bluetooth 4.0+, Bluetooth Smart
- Power-efficient protocol designed for IoT devices
- Provides framework for data exchange
- **Open source**: Fully documented by Bluetooth Special Interest Group (SIG)
- **Sony uses**: Standard Bluetooth chip, nothing proprietary at this layer

**Documentation**: https://www.bluetooth.com/specifications/specs/

### 4.4 GATT Framework (Layer 2)

**Standard**: Generic Attribute Profile (GATT)

- Standard protocol for data exchange over BLE
- Defines services, characteristics, and descriptors
- **Open source**: Part of Bluetooth specification, fully documented
- **Sony uses**: Standard GATT framework for communication

**Key Concepts**:

- **Services**: Collection of functionality (e.g., "Camera Control Service")
- **Characteristics**: Data points within services (e.g., "WiFi SSID characteristic")
- **UUIDs**: 128-bit identifiers for services/characteristics

**Documentation**: Bluetooth SIG GATT specification

### 4.5 Sony's Proprietary Protocol (Layer 3)

**Standard**: Sony-specific implementation

- **Documented**: ❌ **NOT publicly documented**
- **Needs reverse engineering**: ✅ **YES** to understand actual protocol
- **Protocol type**: Proprietary application protocol on top of GATT

**Technical Details (from reverse engineering)**:

- Uses custom GATT services with Sony-specific UUIDs
- Service UUID example: `8000CC00-CC00-FFFF-FFFF-FFFFFFFFFFFF`
- WiFi-specific characteristics:
  - CC05: WifiStatusNotify
  - CC06: WifiSsidCharacteristic
  - CC07: WifiPasswordCharacteristic
- Discovery via manufacturer data (Company ID: 0x012D)

**Security**:

- Uses GATT's authenticated encryption
- Exact security model not publicly documented
- Credentials transmitted via encrypted BLE characteristics

### 4.6 Sony vs Other Manufacturers

**Each manufacturer has their own proprietary BLE approach**:

| Manufacturer | BLE WiFi Protocol | Unique Approach             |
| ------------ | ----------------- | --------------------------- |
| **Sony**     | Proprietary       | Sony-specific GATT services |
| **Canon**    | Proprietary       | Different BLE services      |
| **Nikon**    | Proprietary       | Different BLE services      |
| **Fujifilm** | Proprietary       | Different BLE services      |

**Industry Standards**:

- **No Bluetooth SIG standard** exists for WiFi credential exchange via GATT
- **Ayla Networks** proposed a Wi-Fi Configuration GATT Service (UUID: `1CF0FE66-3ECF-4D6E-A9FC-E287AB124B96`) but it's vendor-specific, not adopted by camera manufacturers
- **Generic IoT platforms** (Nordic, Espressif, Microchip) have different standard approaches
- **Wi-Fi Alliance's Wi-Fi Easy Connect (DPP)** exists for WiFi provisioning but uses QR codes or NFC, not BLE for credential sharing

**Conclusion**: Sony's BLE WiFi credential handshake is a **proprietary Sony implementation** using standard Bluetooth GATT as a transport layer. While other camera manufacturers also use BLE for WiFi credential exchange, each uses **different proprietary protocols**. There is **no industry-standard BLE protocol** for camera WiFi credential exchange.

---

## 5. Reverse Engineering Strategy

### 5.1 Understanding the Problem

Sony's BLE protocol for WiFi credential exchange is **undocumented and proprietary**. To understand the actual protocol and potentially implement third-party solutions, reverse engineering is required.

### 5.2 Required Tools

**BLE Packet Capture**:

- **nRF Sniffer** (Nordic Semiconductor) - Hardware sniffer for BLE packets
- **Wireshark** with **BLE plugin** - Software analysis
- **Ubertooth** - Alternative BLE sniffer
- **btlejack** - BLE hijacking/sniffing tool

**BLE Protocol Analysis**:

- **Wireshark Bluetooth dissector** - Decode standard BLE/GATT layers
- **Custom dissector plugins** - For Sony-specific protocol decoding
- **GATT Explorer** - Interactive GATT browser (iOS)
- **nRF Connect** - Mobile app for GATT exploration (Android)

**Data Analysis**:

- **Python** with libraries: bleak, bluepy, noble
- **Node.js** with libraries: noble, bleno
- Protocol analysis scripts for data decoding

### 5.3 Reverse Engineering Methodology

**Step 1: BLE Traffic Capture**

```
1. Pair camera with Creators' App using Bluetooth
2. Start nRF Sniffer capture
3. Monitor GATT service discovery
4. Capture service UUIDs and characteristic UUIDs
5. Record read/write operations and data payloads
```

**Step 2: Service/Characteristic Analysis**

```
1. Identify all GATT services exposed by camera
2. Document each service's characteristics
3. Determine read/write/notify properties
4. Analyze data formats (strings, bytes, structures)
5. Map characteristics to functions (SSID, password, status, etc.)
```

**Step 3: Protocol Decoding**

```
1. Analyze WiFi credential encoding format
   - Is SSID encoded as UTF-8 string?
   - Is password encrypted? If so, what algorithm?
   - Are credentials combined in one payload or separate?

2. Understand handshake sequence
   - What operations occur in what order?
   - Are there acknowledgments/confirmations?
   - How are errors signaled?

3. Identify security mechanisms
   - Is there authentication?
   - What encryption (if any) is used?
   - Can credentials be replayed (security risk analysis)?

4. Document state machine
   - What states does the camera go through?
   - What triggers state transitions?
```

**Step 4: Protocol Re-implementation**

```
1. Create GATT service definitions
2. Implement characteristic read/write handlers
3. Encode/decode functions for Sony's data format
4. Test with real camera hardware
5. Debug and refine implementation
```

### 5.4 Challenges and Risks

**Technical Challenges**:

- Encryption may prevent direct credential reading
- Proprietary encoding requires cryptanalysis
- Protocol may change between camera models/firmware versions
- Time-dependent handshakes (may expire quickly)

**Legal/Risks**:

- Reverse engineering may violate Sony's terms of service
- Implementing proprietary protocol could infringe IP rights
- Distribution of tools may be restricted
- Check local laws for reverse engineering legality

### 5.5 Alternative Approaches

**Option A: Full Reverse Engineering**

- Pros: Complete control, can build custom apps
- Cons: Time-consuming, fragile, legal concerns

**Option B: Use Imaging Edge Mobile (Simpler)**

- Pros: QR code method is documented and straightforward
- Cons: Only works with older cameras (A7 III, A7R III, A7S III)

**Option C: Hybrid Approach**

- Use BLE for device discovery and authorization
- Implement standard WiFi connection for control
- Avoid Sony's proprietary BLE protocol entirely
- Pros: More maintainable, leverages standard protocols
- Cons: Requires manual WiFi configuration on both devices

**Option D: Camera-Specific Implementation**

- Build separate implementations for each camera model line
- Focus on most popular models first
- Incremental development and testing

---

## 6. Comparison Summary: QR Code vs BLE WiFi Handshake

### 6.1 Complete Feature Comparison

| Feature                     | Imaging Edge Mobile (QR Code) | Creators' App (BLE Handshake)            |
| --------------------------- | ----------------------------- | ---------------------------------------- |
| **App Generation**          | 2018-2020                     | 2021-Present                             |
| **Initial Connection**      | Scan QR code                  | Bluetooth LE pairing                     |
| **WiFi Credentials**        | In QR code (auto-scan)        | Manual entry required                    |
| **Network Type**            | Camera WiFi Direct hotspot    | Same router on both devices              |
| **Setup Complexity**        | Easy                          | Complex                                  |
| **Connection Speed**        | Immediate                     | Slower (BLE + WiFi setup)                |
| **Reconnection**            | Re-scan QR code               | BLE maintains trust                      |
| **Bluetooth Role**          | Optional (NFC)                | Required                                 |
| **Third-Party Support**     | Easy (QR scanning)            | Difficult (protocol reverse engineering) |
| **Documented Protocol**     | ✅ Yes (public)               | ❌ No (proprietary)                      |
| **WiFi for Remote Control** | ✅ Required                   | ✅ Required                              |
| **Live View**               | ✅ WiFi streaming             | ✅ WiFi streaming                        |
| **QR Code for Connection**  | ✅ Yes                        | ❌ No (download only)                    |

### 6.2 Camera Model Capabilities

| Camera                              | App                 | Connection Method | QR Code WiFi?           | WiFi for Control?        |
| ----------------------------------- | ------------------- | ----------------- | ----------------------- | ------------------------ |
| **A7, A7R (2013)**                  | PlayMemories Mobile | NFC               | ❌ No                   | ✅ Yes                   |
| **A7 II, A7R II (2014)**            | PlayMemories Mobile | NFC               | ❌ No                   | ✅ Yes                   |
| **A7 III, A7R III, A7S III (2018)** | Imaging Edge Mobile | QR Code           | ✅ Yes                  | ✅ Yes                   |
| **A7R IV, IVA (2019)**              | Imaging Edge Mobile | QR Code           | ✅ Yes                  | ✅ Yes                   |
| **A7 IV (2021)**                    | Creators' App       | BLE               | ❌ No                   | ✅ Yes (via BLE-managed) |
| **A7R V (2022)**                    | Creators' App       | BLE               | ❌ No                   | ✅ Yes (via BLE-managed) |
| **A7 V (2025)**                     | Creators' App       | BLE               | ⚠️ QR for download only | ✅ Yes (via BLE-managed) |

### 6.3 Key Insights

**1. WiFi is ALWAYS Required for Remote Control**
Both Imaging Edge Mobile and Creators' App require WiFi for:

- Remote shooting (live view, shutter, settings)
- Image/video transfer
- Live streaming

**2. BLE Alone is Insufficient for Remote Control**
Bluetooth Low Energy bandwidth (~1 Mbps theoretical, much lower practical) cannot support:

- High-resolution live video streaming
- Bulk image transfer
- Real-time settings feedback

**3. BLE's Role is Different**
**Imaging Edge Mobile**: BLE not used for WiFi credentials
**Creators' App**: BLE used as credential exchange + trust management

**4. QR Code is Easiest User Experience**
Imaging Edge Mobile's QR code approach provides:

- One-scan connection
- No manual SSID/password entry
- Reduced setup errors
- Better user experience

**5. Creators' App is More Secure and Maintainable**
BLE pairing provides:

- Persistent trust relationship
- Auto-reconnection capability
- Better security (encryption at BLE layer)
- Reduced QR code generation overhead

---

## 7. Sources and References

### 7.1 Official Sony Documentation

**Help Guides**:

- Sony A7 IV Manual: https://helpguide.sony.net/ilc/2110/v1/th/index.html
- Sony A7R V Manual: https://helpguide.sony.net/ilc/2230/v1/th/index.html
- Sony A7 V Manual: https://helpguide.sony.net/ilc/2540/v1/th/index.html
- Sony A7R IV QR Code Page: https://helpguide.sony.net/ilc/1930/v1/th/contents/TP0002723568.html

**App Documentation**:

- Creators' App Official Site: https://www.sony.net/ca/
- Imaging Edge Mobile (discontinued): https://support.d-imaging.sony.co.jp/

### 7.2 Bluetooth Standards

- Bluetooth SIG Specifications: https://www.bluetooth.com/specifications/specs/
- Bluetooth Low Energy Core Specification: https://www.bluetooth.com/specifications/bluetooth-core-specification/
- GATT (Generic Attribute Profile): Part of Bluetooth Core Specification

### 7.3 Reverse Engineering Tools

- **nRF Sniffer**: https://www.nordicsemi.com/products/development-tools/nrf-sniffer
- **Wireshark**: https://www.wireshark.org/
- **Wireshark BLE Plugin**: https://github.com/wireshark/wireshark/tree/master/epan/bluetooth
- **Ubertooth**: https://github.com/virtualabs/ubertooth
- **GATT Explorer (iOS)**: https://apps.apple.com/us/app/nrf-connect/id1324241026
- **nRF Connect (Android)**: https://play.google.com/store/apps/details?id=no.nordicsector.android.nrfconnect

### 7.4 Python BLE Libraries

- **Bleak**: https://github.com/hbldhble/bleak
- **Bluepy**: https://github.com/IanHarvey/bluepy
- **Noble**: https://github.com/sandeepmistry/noble

### 7.5 Research Notes

All research conducted on **February 1, 2026** by analyzing official Sony help guides and technical documentation. Protocol analysis based on available reverse engineering information and industry standards comparison.

---

## 8. Conclusions

### 8.1 Key Findings

1. **WiFi is Required**: Both old (Imaging Edge Mobile) and new (Creators' App) systems require WiFi for remote control - QR codes and BLE are just setup mechanisms, not replacements for WiFi.

2. **Three App Generations**: Clear evolution from PlayMemories Mobile (NFC) → Imaging Edge Mobile (QR code) → Creators' App (BLE handshake).

3. **Proprietary Protocol**: Sony's BLE WiFi handshake is undocumented and proprietary, requiring reverse engineering to understand fully.

4. **No Industry Standard**: Each camera manufacturer uses their own proprietary BLE protocol - no industry-wide standard exists for WiFi credential exchange.

5. **QR Code Superior for UX**: Imaging Edge Mobile's QR code approach is simpler and more user-friendly than Creators' App's multi-step BLE+manual WiFi configuration.

### 8.2 Recommendations

**For Third-Party App Development**:

1. **Prioritize Imaging Edge Mobile Cameras**:
   - QR code method is documented
   - Easier to implement
   - Supports popular models: A7 III, A7R III, A7S III, A7R IV

2. **For Creators' App Cameras**:
   - Document protocol through reverse engineering
   - Consider hybrid approach (BLE for auth, standard WiFi for control)
   - Focus on most popular models (A7 IV, A7R V)

3. **Legal Compliance**:
   - Review Sony's terms of service
   - Consult legal counsel on reverse engineering
   - Consider obtaining official SDK from Sony

4. **Testing Strategy**:
   - Test across different camera models and firmware versions
   - Protocol may vary between generations
   - Document findings thoroughly

**For UX Design**:

1. **Support Multiple Connection Methods**:
   - QR code scanning (for Imaging Edge Mobile cameras)
   - BLE pairing (for Creators' App cameras)
   - Manual SSID entry (fallback)

2. **Clear User Guidance**:
   - Differentiate camera models clearly
   - Provide step-by-step instructions for each method
   - Include troubleshooting for common issues

---

**Document Version**: 1.0
**Last Updated**: February 1, 2026
