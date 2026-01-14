# Canon Camera Discovery Protocol - Deep Dive
## Layer-by-Layer Breakdown

**Last Updated:** 2026-01-08

---

## Overview: Three-Layer Discovery Process

```
Layer 1: Network Discovery (UPnP/SSDP)
         ↓ Finds camera IP address
Layer 2: Device Description (HTTP/XML)
         ↓ Gets basic device info
Layer 3: PTP Capability Discovery (PTP/IP GetDeviceInfo)
         ↓ Gets detailed camera model & capabilities
```

---

## Layer 1: Network Discovery (UPnP/SSDP)

### Purpose
Find Canon cameras on the local network and get their IP addresses.

### Protocol
**SSDP (Simple Service Discovery Protocol)** - part of UPnP specification

### How It Works

#### Step 1: Camera Broadcasts Presence

When camera enters "Connect to smartphone" mode, it broadcasts SSDP NOTIFY messages:

```
Transport: UDP Multicast
Destination: 239.255.255.250:1900 (UPnP multicast address)
Frequency: Every few seconds (keep-alive)
```

**Example SSDP NOTIFY Message from Canon Camera:**

```http
NOTIFY * HTTP/1.1
Host: 239.255.255.250:1900
Cache-Control: max-age=1800
Location: http://192.168.0.120:49152/upnp/CameraDevDesc.xml
NT: urn:schemas-canon-com:service:ICPO-WFTEOSSystemService:1
NTS: ssdp:alive
Server: Camera OS/1.0 UPnP/1.0 Canon Device Discovery/1.0
USN: uuid:00000000-0000-0000-0001-60128B7CC240::urn:schemas-canon-com:service:ICPO-WFTEOSSystemService:1
```

**Key Fields Explained:**

| Field | Value | Purpose |
|-------|-------|---------|
| `Host` | 239.255.255.250:1900 | Standard UPnP multicast address |
| `Cache-Control` | max-age=1800 | How long to consider device "alive" (30 min) |
| `Location` | http://192.168.0.120:49152/upnp/CameraDevDesc.xml | **URL to device description XML** |
| `NT` | urn:schemas-canon-com:service:ICPO-WFTEOSSystemService:1 | Canon-specific service type |
| `NTS` | ssdp:alive | Notification type (alive/byebye/update) |
| `Server` | Camera OS/1.0 UPnP/1.0... | Server identification string |
| `USN` | uuid:...:urn:... | Unique Service Name (device UUID + service) |

#### Step 2: Your App Listens for Broadcasts

**iOS Implementation:**

```swift
import Network

func startUPnPDiscovery() {
    // Create UDP listener on port 1900
    let connection = NWConnection(
        host: NWEndpoint.Host("239.255.255.250"),
        port: NWEndpoint.Port(rawValue: 1900)!,
        using: .udp
    )

    connection.stateUpdateHandler = { state in
        if state == .ready {
            self.receiveUPnPMessages(connection)
        }
    }

    connection.start(queue: .global())
}

func receiveUPnPMessages(_ connection: NWConnection) {
    connection.receiveMessage { data, context, isComplete, error in
        if let data = data, let message = String(data: data, encoding: .utf8) {
            // Parse SSDP message
            if message.contains("NOTIFY") &&
               message.contains("urn:schemas-canon-com:service:ICPO-WFTEOSSystemService") {

                // Extract Location URL
                if let locationURL = self.extractLocation(from: message) {
                    // Proceed to Layer 2
                    self.fetchDeviceDescription(url: locationURL)
                }
            }
        }

        // Continue listening
        self.receiveUPnPMessages(connection)
    }
}

func extractLocation(from ssdpMessage: String) -> String? {
    let lines = ssdpMessage.components(separatedBy: "\r\n")
    for line in lines {
        if line.lowercased().starts(with: "location:") {
            return line.replacingOccurrences(of: "Location:", with: "")
                       .trimmingCharacters(in: .whitespaces)
        }
    }
    return nil
}
```

#### Alternative: M-SEARCH (Active Discovery)

Instead of waiting for broadcasts, you can actively search:

**M-SEARCH Request (sent by your app):**

```http
M-SEARCH * HTTP/1.1
Host: 239.255.255.250:1900
Man: "ssdp:discover"
MX: 3
ST: ssdp:all

```

Camera will respond with similar NOTIFY-style message.

### What You Know After Layer 1:

- ✅ Camera exists on network
- ✅ Camera IP address (from Location URL)
- ✅ Camera is Canon (from service type)
- ✅ URL to get more info (device description)
- ❌ Camera model (not yet)
- ❌ Camera capabilities (not yet)

---

## Layer 2: Device Description (HTTP/XML)

### Purpose
Get basic device information including friendly name, manufacturer, model number.

### Protocol
**HTTP GET** to the Location URL from SSDP message

### How It Works

#### Step 1: Fetch Device Description XML

**HTTP Request:**

```http
GET /upnp/CameraDevDesc.xml HTTP/1.1
Host: 192.168.0.120:49152
User-Agent: YourApp/1.0
```

#### Step 2: Parse XML Response

**Example Response (UPnP Device Description XML):**

```xml
<?xml version="1.0"?>
<root xmlns="urn:schemas-upnp-org:device-1-0">
    <specVersion>
        <major>1</major>
        <minor>0</minor>
    </specVersion>
    <device>
        <deviceType>urn:schemas-canon-com:device:EOS-Device:1</deviceType>
        <friendlyName>Canon EOS R5</friendlyName>
        <manufacturer>Canon Inc.</manufacturer>
        <manufacturerURL>http://www.canon.com</manufacturerURL>
        <modelDescription>Canon Digital Camera</modelDescription>
        <modelName>EOS R5</modelName>
        <modelNumber>3986C002</modelNumber>
        <modelURL>http://www.canon.com</modelURL>
        <serialNumber>012345678901</serialNumber>
        <UDN>uuid:00000000-0000-0000-0001-60128B7CC240</UDN>
        <serviceList>
            <service>
                <serviceType>urn:schemas-canon-com:service:ICPO-WFTEOSSystemService:1</serviceType>
                <serviceId>urn:canon-com:serviceId:ICPO-WFTEOSSystemService</serviceId>
                <SCPDURL>/upnp/ICPO-WFTEOSSystemService.xml</SCPDURL>
                <controlURL>/upnp/control/ICPO-WFTEOSSystemService</controlURL>
                <eventSubURL>/upnp/event/ICPO-WFTEOSSystemService</eventSubURL>
            </service>
        </serviceList>
        <presentationURL>http://192.168.0.120</presentationURL>
    </device>
</root>
```

**Key Fields Explained:**

| Field | Example Value | Purpose |
|-------|---------------|---------|
| `deviceType` | urn:schemas-canon-com:device:EOS-Device:1 | Identifies as Canon EOS device |
| `friendlyName` | Canon EOS R5 | **Human-readable camera name** |
| `manufacturer` | Canon Inc. | Manufacturer name |
| `modelName` | EOS R5 | **Camera model** |
| `modelNumber` | 3986C002 | Canon product code |
| `serialNumber` | 012345678901 | Camera serial number |
| `UDN` | uuid:... | Unique Device Name (same as SSDP USN) |
| `serviceList` | ... | Available UPnP services (not used for PTP) |

#### Step 3: Parse and Display to User

**iOS Implementation:**

```swift
func fetchDeviceDescription(url: String) {
    guard let xmlURL = URL(string: url) else { return }

    URLSession.shared.dataTask(with: xmlURL) { data, response, error in
        guard let data = data else { return }

        let parser = XMLParser(data: data)
        let delegate = UPnPXMLParserDelegate()
        parser.delegate = delegate
        parser.parse()

        if let deviceInfo = delegate.deviceInfo {
            print("Found camera: \(deviceInfo.modelName)")
            print("Manufacturer: \(deviceInfo.manufacturer)")
            print("Serial: \(deviceInfo.serialNumber)")

            // Extract IP from URL
            let ipAddress = self.extractIPFromURL(url)

            // Notify UI
            DispatchQueue.main.async {
                self.onCameraDiscovered?(deviceInfo, ipAddress)
            }
        }
    }.resume()
}

class UPnPXMLParserDelegate: NSObject, XMLParserDelegate {
    var deviceInfo = DeviceInfo()
    var currentElement = ""

    func parser(_ parser: XMLParser, didStartElement elementName: String,
                namespaceURI: String?, qualifiedName qName: String?,
                attributes attributeDict: [String : String] = [:]) {
        currentElement = elementName
    }

    func parser(_ parser: XMLParser, foundCharacters string: String) {
        let trimmed = string.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty { return }

        switch currentElement {
        case "friendlyName":
            deviceInfo.friendlyName = trimmed
        case "manufacturer":
            deviceInfo.manufacturer = trimmed
        case "modelName":
            deviceInfo.modelName = trimmed
        case "modelNumber":
            deviceInfo.modelNumber = trimmed
        case "serialNumber":
            deviceInfo.serialNumber = trimmed
        case "UDN":
            deviceInfo.udn = trimmed
        default:
            break
        }
    }
}
```

### What You Know After Layer 2:

- ✅ Camera friendly name ("Canon EOS R5")
- ✅ Manufacturer ("Canon Inc.")
- ✅ Model name ("EOS R5")
- ✅ Model number (product code)
- ✅ Serial number
- ✅ Device UUID
- ❌ PTP capabilities (what operations supported)
- ❌ Image formats supported
- ❌ Detailed camera properties

---

## Layer 3: PTP Capability Discovery (GetDeviceInfo)

### Purpose
Get detailed PTP capabilities: supported operations, events, properties, and image formats.

### Protocol
**PTP/IP** - Picture Transfer Protocol over TCP/IP

### When This Happens
After establishing PTP/IP connection (both command and event channels).

### How It Works

#### Step 1: Establish PTP/IP Connection

See main implementation guide for connection sequence (command channel + event channel).

#### Step 2: Send GetDeviceInfo Command

**PTP Operation Code:** `0x1001` (GetDeviceInfo)

**Command Packet Structure:**

```
[Container Length: 4 bytes]
[Container Type: 4 bytes] = 0x00000001 (Command)
[Operation Code: 2 bytes] = 0x1001 (GetDeviceInfo)
[Transaction ID: 4 bytes]
[No parameters]
```

**Example in Swift (pseudo-code):**

```swift
func sendGetDeviceInfo(socket: NWConnection) {
    var packet = Data()

    // Container length (calculated later)
    let containerLength: UInt32 = 14 // Header only, no params
    packet.append(containerLength.littleEndian)

    // Container type (Command)
    let containerType: UInt32 = 0x00000001
    packet.append(containerType.littleEndian)

    // Operation code (GetDeviceInfo)
    let opCode: UInt16 = 0x1001
    packet.append(opCode.littleEndian)

    // Transaction ID
    let transactionID: UInt32 = self.nextTransactionID()
    packet.append(transactionID.littleEndian)

    // Send packet
    socket.send(content: packet, completion: .contentProcessed { error in
        if error == nil {
            self.receiveGetDeviceInfoResponse(socket: socket)
        }
    })
}
```

#### Step 3: Receive GetDeviceInfo Response

**Response Packet Structure:**

```
[Container Length: 4 bytes]
[Container Type: 4 bytes] = 0x00000002 (Data)
[Operation Code: 2 bytes] = 0x1001
[Transaction ID: 4 bytes]
[DeviceInfo Dataset: variable length]
```

**DeviceInfo Dataset Structure (from libgphoto2):**

```c
struct PTPDeviceInfo {
    uint16_t StandardVersion;           // PTP version (e.g., 0x0100 = v1.0)
    uint32_t VendorExtensionID;         // Canon = 0x0000000B
    uint16_t VendorExtensionVersion;    // Canon extension version
    char *VendorExtensionDesc;          // "Canon Extension"
    uint16_t FunctionalMode;            // 0x0000 = Standard mode

    // Supported Operations (array)
    uint32_t Operations_len;            // Number of operations
    uint16_t *Operations;               // Operation codes array

    // Supported Events (array)
    uint32_t Events_len;                // Number of events
    uint16_t *Events;                   // Event codes array

    // Supported Device Properties (array)
    uint32_t DeviceProps_len;           // Number of properties
    uint16_t *DeviceProps;              // Property codes array

    // Supported Capture Formats (array)
    uint32_t CaptureFormats_len;        // Number of capture formats
    uint16_t *CaptureFormats;           // Format codes (JPEG, RAW, etc.)

    // Supported Image Formats (array)
    uint32_t ImageFormats_len;          // Number of image formats
    uint16_t *ImageFormats;             // Format codes

    // Device Identification
    char *Manufacturer;                  // "Canon Inc."
    char *Model;                        // "Canon EOS R5"
    char *DeviceVersion;                // Firmware version "1.2.0"
    char *SerialNumber;                 // "012345678901"
};
```

#### Step 4: Parse Response

**Example Canon EOS R5 GetDeviceInfo Response:**

```
StandardVersion: 0x0100 (PTP v1.0)
VendorExtensionID: 0x0000000B (Canon)
VendorExtensionVersion: 0x0100
VendorExtensionDesc: "Canon Extension"
FunctionalMode: 0x0000

Operations (73 total):
  - 0x1001: GetDeviceInfo
  - 0x1002: OpenSession
  - 0x1003: CloseSession
  - 0x1004: GetStorageIDs
  - 0x1005: GetStorageInfo
  - 0x1007: GetObjectHandles
  - 0x1008: GetObjectInfo
  - 0x1009: GetObject (IMAGE DOWNLOAD!)
  - 0x100B: DeleteObject
  - 0x100C: SendObjectInfo
  - 0x100D: SendObject
  - 0x100E: InitiateCapture
  - 0x9101: EOS_GetStorageIDs (Canon)
  - 0x9102: EOS_GetStorageInfo (Canon)
  - 0x9103: EOS_GetObjectInfo (Canon)
  - 0x9104: EOS_GetObject (Canon)
  - 0x9105: EOS_DeleteObject (Canon)
  - 0x9114: EOS_SetRemoteMode (Canon)
  - 0x9115: EOS_SetEventMode (Canon)
  ... (more Canon-specific operations)

Events (15 total):
  - 0x4002: ObjectAdded (NEW IMAGE!)
  - 0x4003: ObjectRemoved
  - 0x4004: StoreAdded
  - 0x4005: StoreRemoved
  - 0x4006: DevicePropChanged
  - 0xC101: EOS_RequestObjectTransfer (Canon)
  - 0xC102: EOS_ObjectAddedEx (Canon)
  ... (more Canon events)

DeviceProps (45 total):
  - 0x5001: BatteryLevel
  - 0x5003: ImageSize
  - 0x5004: CompressionSetting
  - 0x5005: WhiteBalance
  - 0x5007: FNumber
  - 0x5008: FocalLength
  - 0x500D: ExposureTime
  ... (more properties)

CaptureFormats:
  - 0x3801: JPEG (EXIF)
  - 0xB103: Canon RAW (.CR3)

ImageFormats:
  - 0x3801: JPEG (EXIF)
  - 0xB103: Canon RAW (.CR3)
  - 0x3800: JPEG baseline

Manufacturer: "Canon Inc."
Model: "Canon EOS R5"
DeviceVersion: "3-1.2.0" (Firmware)
SerialNumber: "123456789012"
```

**iOS Parsing Implementation:**

```swift
struct PTPDeviceInfo {
    var standardVersion: UInt16
    var vendorExtensionID: UInt32
    var vendorExtensionDesc: String
    var operations: [UInt16]
    var events: [UInt16]
    var deviceProps: [UInt16]
    var captureFormats: [UInt16]
    var imageFormats: [UInt16]
    var manufacturer: String
    var model: String
    var deviceVersion: String
    var serialNumber: String

    // Convenience methods
    func supportsOperation(_ opCode: UInt16) -> Bool {
        return operations.contains(opCode)
    }

    func supportsEvent(_ eventCode: UInt16) -> Bool {
        return events.contains(eventCode)
    }

    func supportsImageFormat(_ formatCode: UInt16) -> Bool {
        return imageFormats.contains(formatCode)
    }

    var supportsImageDownload: Bool {
        return supportsOperation(0x1009) // GetObject
    }

    var supportsObjectAddedEvent: Bool {
        return supportsEvent(0x4002) // ObjectAdded
    }

    var isCanonCamera: Bool {
        return vendorExtensionID == 0x0000000B
    }
}

func parseGetDeviceInfoResponse(data: Data) -> PTPDeviceInfo? {
    var offset = 12 // Skip container header (length, type, code, transaction)

    guard data.count > offset + 2 else { return nil }

    // Read StandardVersion
    let standardVersion = data.readUInt16(at: &offset)

    // Read VendorExtensionID
    let vendorID = data.readUInt32(at: &offset)

    // Read VendorExtensionVersion
    let vendorVersion = data.readUInt16(at: &offset)

    // Read VendorExtensionDesc (PTP String)
    let vendorDesc = data.readPTPString(at: &offset)

    // Read FunctionalMode
    let functionalMode = data.readUInt16(at: &offset)

    // Read Operations array
    let operations = data.readUInt16Array(at: &offset)

    // Read Events array
    let events = data.readUInt16Array(at: &offset)

    // Read DeviceProps array
    let deviceProps = data.readUInt16Array(at: &offset)

    // Read CaptureFormats array
    let captureFormats = data.readUInt16Array(at: &offset)

    // Read ImageFormats array
    let imageFormats = data.readUInt16Array(at: &offset)

    // Read Manufacturer string
    let manufacturer = data.readPTPString(at: &offset)

    // Read Model string
    let model = data.readPTPString(at: &offset)

    // Read DeviceVersion string
    let deviceVersion = data.readPTPString(at: &offset)

    // Read SerialNumber string
    let serialNumber = data.readPTPString(at: &offset)

    return PTPDeviceInfo(
        standardVersion: standardVersion,
        vendorExtensionID: vendorID,
        vendorExtensionDesc: vendorDesc,
        operations: operations,
        events: events,
        deviceProps: deviceProps,
        captureFormats: captureFormats,
        imageFormats: imageFormats,
        manufacturer: manufacturer,
        model: model,
        deviceVersion: deviceVersion,
        serialNumber: serialNumber
    )
}

// Helper extension for reading PTP data types
extension Data {
    func readUInt16(at offset: inout Int) -> UInt16 {
        let value = self.withUnsafeBytes { $0.load(fromByteOffset: offset, as: UInt16.self) }
        offset += 2
        return UInt16(littleEndian: value)
    }

    func readUInt32(at offset: inout Int) -> UInt32 {
        let value = self.withUnsafeBytes { $0.load(fromByteOffset: offset, as: UInt32.self) }
        offset += 4
        return UInt32(littleEndian: value)
    }

    func readPTPString(at offset: inout Int) -> String {
        // PTP strings: 1 byte length (in chars), then UTF-16LE characters
        let length = self[offset]
        offset += 1

        if length == 0 { return "" }

        let charCount = Int(length) - 1 // Exclude null terminator
        let byteCount = charCount * 2
        let stringData = self.subdata(in: offset..<(offset + byteCount))
        offset += byteCount + 2 // +2 for null terminator

        return String(data: stringData, encoding: .utf16LittleEndian) ?? ""
    }

    func readUInt16Array(at offset: inout Int) -> [UInt16] {
        let count = readUInt32(at: &offset)
        var array: [UInt16] = []
        for _ in 0..<count {
            array.append(readUInt16(at: &offset))
        }
        return array
    }
}
```

### What You Know After Layer 3:

- ✅ **Complete camera model** ("Canon EOS R5")
- ✅ **Firmware version** ("3-1.2.0")
- ✅ **All supported PTP operations** (can download images? can trigger capture?)
- ✅ **All supported events** (will camera notify on new image?)
- ✅ **Supported image formats** (JPEG, RAW, etc.)
- ✅ **Camera properties** (what settings can be read/changed)
- ✅ **Canon vendor extensions** (EOS-specific features)

---

## Complete Discovery Flow Summary

```
┌─────────────────────────────────────────────────────────────┐
│ LAYER 1: UPnP/SSDP (Network Discovery)                      │
│ ------------------------------------------------------------ │
│ Camera: "I'm here!" → UDP Multicast 239.255.255.250:1900   │
│ App: Receives → Extracts IP & XML URL                       │
│ Time: Instant (broadcast received)                          │
│ Data: IP address, XML URL                                   │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ LAYER 2: Device Description (HTTP/XML)                      │
│ ------------------------------------------------------------ │
│ App: HTTP GET CameraDevDesc.xml                             │
│ Camera: Returns XML with friendly name, model, serial       │
│ Time: ~100-500ms (HTTP request)                             │
│ Data: Model name ("EOS R5"), manufacturer, serial           │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ PTP/IP CONNECTION ESTABLISHMENT                              │
│ ------------------------------------------------------------ │
│ Command Channel: TCP 15740 → Init + Pairing                 │
│ Event Channel: TCP 15740 → Init                             │
│ OpenSession, SetRemoteMode, SetEventMode                    │
│ Time: ~2-3 seconds (first time), ~1 second (subsequent)     │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ LAYER 3: PTP Capability Discovery (GetDeviceInfo)           │
│ ------------------------------------------------------------ │
│ App: Send GetDeviceInfo (0x1001)                            │
│ Camera: Returns full PTP capabilities dataset               │
│ Time: ~100-300ms                                             │
│ Data: Operations, events, formats, properties, firmware     │
└─────────────────────────────────────────────────────────────┘
                              ↓
                    ✅ READY TO USE CAMERA
```

---

## Key Insights

### 1. Model Discovery Happens at Multiple Layers

- **Layer 2 (XML)**: Basic model name ("EOS R5")
- **Layer 3 (PTP)**: Detailed model with firmware ("Canon EOS R5", "3-1.2.0")

### 2. Capabilities Only from PTP Layer

- You must establish PTP connection to know what camera can do
- UPnP/XML doesn't tell you if camera supports image download
- Always send GetDeviceInfo before assuming capabilities

### 3. Canon-Specific Extensions

VendorExtensionID `0x0000000B` = Canon

Canon cameras support standard PTP operations **plus** Canon EOS extensions (0x9xxx operations).

### 4. Critical Operations for Image Transfer

Must check camera supports:
- `0x1009` (GetObject) - Download images
- `0x4002` (ObjectAdded event) - Notification of new images

### 5. Why Three Layers?

- **Layer 1 (SSDP)**: Fast, lightweight, finds devices on network
- **Layer 2 (XML)**: Human-readable info, no PTP knowledge needed
- **Layer 3 (PTP)**: Detailed capabilities, requires protocol knowledge

---

## Implementation Checklist

- [ ] Implement UPnP/SSDP listener (UDP 1900)
- [ ] Parse SSDP NOTIFY messages
- [ ] Extract Location URL from SSDP
- [ ] Fetch device description XML via HTTP
- [ ] Parse XML for model, manufacturer, serial
- [ ] Establish PTP/IP connection (command + event channels)
- [ ] Send GetDeviceInfo (0x1001)
- [ ] Parse GetDeviceInfo response
- [ ] Verify camera supports GetObject (0x1009)
- [ ] Verify camera supports ObjectAdded event (0x4002)
- [ ] Cache camera capabilities for session

---

## References

- [UPnP Device Architecture Specification](https://upnp.org/specs/arch/UPnP-arch-DeviceArchitecture-v1.1.pdf)
- [Pairing PTP/IP Connection with Canon Camera](https://julianschroden.com/post/2023-05-10-pairing-and-initializing-a-ptp-ip-connection-with-a-canon-eos-camera/)
- [libgphoto2 PTP Implementation](https://github.com/gphoto/libgphoto2/blob/master/camlibs/ptp2/ptp.h)
- [PTP Specification ISO 15740](https://en.wikipedia.org/wiki/Picture_Transfer_Protocol)
- [Canon PTP/IP Helpers](https://github.com/reyalpchdk/ptpip-canon-helpers)
