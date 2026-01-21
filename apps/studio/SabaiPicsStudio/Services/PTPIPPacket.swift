//
//  PTPIPPacket.swift
//  SabaiPicsStudio
//
//  Created: 2026-01-19
//  PTP/IP packet structures and serialization (ISO 15740)
//  Based on libgphoto2's ptpip.c implementation
//

import Foundation
import Network

// MARK: - PTP/IP Packet Types
// From libgphoto2: camlibs/ptp2/ptpip.c

/// PTP/IP packet type codes
enum PTPIPPacketType: UInt32 {
    case initCommandRequest = 0x00000001
    case initCommandAck = 0x00000002
    case initEventRequest = 0x00000003
    case initEventAck = 0x00000004
    case initFail = 0x00000005
    case operationRequest = 0x00000006  // Command
    case operationResponse = 0x00000007 // Response
    case event = 0x00000008
    case startDataPacket = 0x00000009
    case dataPacket = 0x0000000A
    case cancelTransaction = 0x0000000B
    case endDataPacket = 0x0000000C
    case ping = 0x0000000D
    case pong = 0x0000000E
}

// MARK: - PTP/IP Packet Header
// From libgphoto2: #define ptpip_len 0, #define ptpip_type 4

/// Base packet header (8 bytes)
/// All PTP/IP packets start with: Length (4) + Type (4)
struct PTPIPHeader {
    let length: UInt32  // Total packet length including header
    let type: UInt32    // PTPIPPacketType

    init(length: UInt32, type: PTPIPPacketType) {
        self.length = length
        self.type = type.rawValue
    }

    /// Serialize to little-endian bytes (PTP/IP is little-endian)
    func toData() -> Data {
        var data = Data()
        data.append(contentsOf: withUnsafeBytes(of: length.littleEndian) { Data($0) })
        data.append(contentsOf: withUnsafeBytes(of: type.littleEndian) { Data($0) })
        return data
    }

    /// Parse from received bytes
    static func from(_ data: Data) -> PTPIPHeader? {
        guard data.count >= 8 else { return nil }

        let length = data.withUnsafeBytes { $0.loadUnaligned(fromByteOffset: 0, as: UInt32.self) }
        let type = data.withUnsafeBytes { $0.loadUnaligned(fromByteOffset: 4, as: UInt32.self) }

        guard let packetType = PTPIPPacketType(rawValue: UInt32(littleEndian: type)) else {
            return nil
        }

        return PTPIPHeader(length: UInt32(littleEndian: length), type: packetType)
    }
}

// MARK: - Init Command Request
// From libgphoto2: PTPIP_INIT_COMMAND_REQUEST structure

/// Init Command Request packet (sent to establish command channel)
struct PTPIPInitCommandRequest {
    let guid: UUID           // 16-byte GUID
    let hostName: String     // UCS-2 little-endian string

    func toData() -> Data {
        var payload = Data()

        // GUID (16 bytes)
        payload.append(contentsOf: guid.uuid.0.toByteArray())
        payload.append(contentsOf: guid.uuid.1.toByteArray())
        payload.append(contentsOf: guid.uuid.2.toByteArray())
        payload.append(contentsOf: guid.uuid.3.toByteArray())
        payload.append(contentsOf: guid.uuid.4.toByteArray())
        payload.append(contentsOf: guid.uuid.5.toByteArray())
        payload.append(contentsOf: guid.uuid.6.toByteArray())
        payload.append(contentsOf: guid.uuid.7.toByteArray())
        payload.append(contentsOf: guid.uuid.8.toByteArray())
        payload.append(contentsOf: guid.uuid.9.toByteArray())
        payload.append(contentsOf: guid.uuid.10.toByteArray())
        payload.append(contentsOf: guid.uuid.11.toByteArray())
        payload.append(contentsOf: guid.uuid.12.toByteArray())
        payload.append(contentsOf: guid.uuid.13.toByteArray())
        payload.append(contentsOf: guid.uuid.14.toByteArray())
        payload.append(contentsOf: guid.uuid.15.toByteArray())

        // Host name as UCS-2 string (NO length prefix - direct encoding per libgphoto2)
        // From ptpip.c: each char becomes [char, 0x00] including null terminator
        let ucs2String = hostName.utf16.map { $0.littleEndian }

        for char in ucs2String {
            payload.append(contentsOf: withUnsafeBytes(of: char) { Data($0) })
        }
        // Null terminator (UCS-2 encoding of '\0')
        payload.append(contentsOf: withUnsafeBytes(of: UInt16(0).littleEndian) { Data($0) })

        // Protocol version: Two separate UInt16 values (per libgphoto2)
        let versionMinor: UInt16 = 0  // PTPIP_VERSION_MINOR
        let versionMajor: UInt16 = 1  // PTPIP_VERSION_MAJOR
        payload.append(contentsOf: withUnsafeBytes(of: versionMinor.littleEndian) { Data($0) })
        payload.append(contentsOf: withUnsafeBytes(of: versionMajor.littleEndian) { Data($0) })

        // Create header
        let totalLength = UInt32(8 + payload.count)
        let header = PTPIPHeader(length: totalLength, type: .initCommandRequest)

        var packet = header.toData()
        packet.append(payload)
        return packet
    }
}

// MARK: - Init Event Request
// From libgphoto2: PTPIP_INIT_EVENT_REQUEST structure

/// Init Event Request packet (sent to establish event channel)
struct PTPIPInitEventRequest {
    let connectionNumber: UInt32  // From Init Command Ack

    func toData() -> Data {
        var payload = Data()
        payload.append(contentsOf: withUnsafeBytes(of: connectionNumber.littleEndian) { Data($0) })

        let totalLength = UInt32(8 + payload.count)
        let header = PTPIPHeader(length: totalLength, type: .initEventRequest)

        var packet = header.toData()
        packet.append(payload)
        return packet
    }
}

// MARK: - Operation Request (Command)
// From libgphoto2: ptpip_cmd_* offsets

/// Operation Request packet (PTP command)
struct PTPIPOperationRequest {
    let dataPhaseInfo: UInt32   // 1=receive or no data, 2=send data
    let operationCode: UInt16   // PTP operation code
    let transactionID: UInt32   // Unique transaction ID
    let parameters: [UInt32]    // Command parameters (up to 5)

    func toData() -> Data {
        var payload = Data()

        // Data phase info
        payload.append(contentsOf: withUnsafeBytes(of: dataPhaseInfo.littleEndian) { Data($0) })

        // Operation code (16-bit)
        payload.append(contentsOf: withUnsafeBytes(of: operationCode.littleEndian) { Data($0) })

        // Transaction ID
        payload.append(contentsOf: withUnsafeBytes(of: transactionID.littleEndian) { Data($0) })

        // Parameters (up to 5)
        for param in parameters.prefix(5) {
            payload.append(contentsOf: withUnsafeBytes(of: param.littleEndian) { Data($0) })
        }

        let totalLength = UInt32(8 + payload.count)
        let header = PTPIPHeader(length: totalLength, type: .operationRequest)

        var packet = header.toData()
        packet.append(payload)
        return packet
    }
}

// MARK: - Operation Response
// Response packet parser

struct PTPIPOperationResponse {
    let responseCode: UInt16
    let transactionID: UInt32
    let parameters: [UInt32]

    static func from(_ data: Data) -> PTPIPOperationResponse? {
        guard data.count >= 8 else { return nil }

        // Parse header
        guard let header = PTPIPHeader.from(data),
              header.type == PTPIPPacketType.operationResponse.rawValue else {
            return nil
        }

        let payload = data.dropFirst(8)
        guard payload.count >= 6 else { return nil }

        let responseCode = payload.withUnsafeBytes { $0.loadUnaligned(fromByteOffset: 0, as: UInt16.self) }
        let transactionID = payload.withUnsafeBytes { $0.loadUnaligned(fromByteOffset: 2, as: UInt32.self) }

        var parameters: [UInt32] = []
        var offset = 6
        while offset + 4 <= payload.count {
            let param = payload.withUnsafeBytes { $0.loadUnaligned(fromByteOffset: offset, as: UInt32.self) }
            parameters.append(UInt32(littleEndian: param))
            offset += 4
        }

        return PTPIPOperationResponse(
            responseCode: UInt16(littleEndian: responseCode),
            transactionID: UInt32(littleEndian: transactionID),
            parameters: parameters
        )
    }
}

// MARK: - Data Packet
// From libgphoto2: PTPIP_START_DATA_PACKET, PTPIP_DATA_PACKET, PTPIP_END_DATA_PACKET

/// Start Data Packet (first packet when receiving data)
struct PTPIPStartDataPacket {
    let transactionID: UInt32
    let totalDataLength: UInt32

    static func from(_ data: Data) -> PTPIPStartDataPacket? {
        guard data.count >= 20 else { return nil }

        let payload = data.dropFirst(8)
        let transactionID = payload.withUnsafeBytes { $0.loadUnaligned(fromByteOffset: 0, as: UInt32.self) }
        let totalDataLength = payload.withUnsafeBytes { $0.loadUnaligned(fromByteOffset: 4, as: UInt32.self) }

        return PTPIPStartDataPacket(
            transactionID: UInt32(littleEndian: transactionID),
            totalDataLength: UInt32(littleEndian: totalDataLength)
        )
    }
}

/// Data Packet (chunked data transfer)
struct PTPIPDataPacket {
    let transactionID: UInt32
    let data: Data

    static func from(_ data: Data) -> PTPIPDataPacket? {
        guard data.count >= 12 else { return nil }

        let payload = data.dropFirst(8)
        let transactionID = payload.withUnsafeBytes { $0.loadUnaligned(fromByteOffset: 0, as: UInt32.self) }
        let packetData = payload.dropFirst(4)

        return PTPIPDataPacket(
            transactionID: UInt32(littleEndian: transactionID),
            data: packetData
        )
    }
}

// MARK: - Event Packet
// From libgphoto2: event packet structure

/// Event Packet (ObjectAdded, etc.)
struct PTPIPEventPacket {
    let eventCode: UInt16
    let transactionID: UInt32
    let parameters: [UInt32]

    static func from(_ data: Data) -> PTPIPEventPacket? {
        guard data.count >= 8 else { return nil }

        guard let header = PTPIPHeader.from(data),
              header.type == PTPIPPacketType.event.rawValue else {
            return nil
        }

        let payload = data.dropFirst(8)
        guard payload.count >= 6 else { return nil }

        let eventCode = payload.withUnsafeBytes { $0.loadUnaligned(fromByteOffset: 0, as: UInt16.self) }
        let transactionID = payload.withUnsafeBytes { $0.loadUnaligned(fromByteOffset: 2, as: UInt32.self) }

        var parameters: [UInt32] = []
        var offset = 6
        while offset + 4 <= payload.count {
            let param = payload.withUnsafeBytes { $0.loadUnaligned(fromByteOffset: offset, as: UInt32.self) }
            parameters.append(UInt32(littleEndian: param))
            offset += 4
        }

        return PTPIPEventPacket(
            eventCode: UInt16(littleEndian: eventCode),
            transactionID: UInt32(littleEndian: transactionID),
            parameters: parameters
        )
    }
}

// MARK: - PTP Object Format Codes
// From libgphoto2: camlibs/ptp2/ptp.h

/// PTP object format codes (ISO 15740 + vendor extensions)
enum PTPObjectFormat: UInt16 {
    // Standard formats
    case undefined = 0x3000
    case association = 0x3001  // Folder/directory
    case script = 0x3002
    case executable = 0x3003
    case text = 0x3004
    case html = 0x3005
    case dpof = 0x3006
    case aiff = 0x3007
    case wav = 0x3008
    case mp3 = 0x3009
    case avi = 0x300A
    case mpeg = 0x300B
    case asf = 0x300C

    // Image formats
    case exifJpeg = 0x3801      // JPEG (most common)
    case tiffEP = 0x3802
    case flashPix = 0x3803
    case bmp = 0x3804
    case ciff = 0x3805         // Canon CRW (older Canon RAW)
    case gif = 0x3807
    case jfif = 0x3808
    case pcd = 0x3809
    case pict = 0x380A
    case png = 0x380B
    case tiff = 0x380D
    case tiffIT = 0x380E
    case jp2 = 0x380F          // JPEG 2000
    case jpx = 0x3810

    // Canon RAW formats
    case canonCRW = 0xB101     // Canon CRW (older)
    case canonCR2 = 0xB103     // Canon CR2 (most common Canon RAW)
    case canonCR3 = 0xB108     // Canon CR3 (newer mirrorless)

    // Other vendor RAW formats
    case rawData = 0xB104      // Generic RAW

    /// Check if this format is a RAW image
    var isRawFormat: Bool {
        switch self {
        case .ciff, .canonCRW, .canonCR2, .canonCR3, .rawData:
            return true
        default:
            // Also check by range - many vendor RAW codes are in 0xB1xx range
            return rawValue >= 0xB100 && rawValue <= 0xB1FF
        }
    }

    /// Check if this format is a JPEG image
    var isJpegFormat: Bool {
        switch self {
        case .exifJpeg, .jfif:
            return true
        default:
            return false
        }
    }
}

// MARK: - PTP Object Info
// From libgphoto2: PTPObjectInfo structure in ptp.h

/// Object information returned by GetObjectInfo command
/// Contains metadata about a file/object on the camera
struct PTPObjectInfo {
    let storageID: UInt32
    let objectFormat: UInt16          // PTPObjectFormat
    let protectionStatus: UInt16
    let objectCompressedSize: UInt32
    let thumbFormat: UInt16
    let thumbCompressedSize: UInt32
    let thumbPixWidth: UInt32
    let thumbPixHeight: UInt32
    let imagePixWidth: UInt32
    let imagePixHeight: UInt32
    let imageBitDepth: UInt32
    let parentObject: UInt32
    let associationType: UInt16
    let associationDesc: UInt32
    let sequenceNumber: UInt32
    let filename: String
    let captureDate: String
    let modificationDate: String
    let keywords: String

    /// Check if this object is a RAW file
    var isRawFile: Bool {
        // Check by format code
        if let format = PTPObjectFormat(rawValue: objectFormat), format.isRawFormat {
            return true
        }

        // Also check by filename extension as backup
        let lowerFilename = filename.lowercased()
        let rawExtensions = [".cr2", ".cr3", ".crw", ".raw", ".dng", ".nef", ".arw", ".orf", ".rw2"]
        return rawExtensions.contains { lowerFilename.hasSuffix($0) }
    }

    /// Check if this object is a JPEG file
    var isJpegFile: Bool {
        // Check by format code
        if let format = PTPObjectFormat(rawValue: objectFormat), format.isJpegFormat {
            return true
        }

        // Also check by filename extension as backup
        let lowerFilename = filename.lowercased()
        return lowerFilename.hasSuffix(".jpg") || lowerFilename.hasSuffix(".jpeg")
    }

    /// Parse ObjectInfo from response data
    /// Based on libgphoto2 ptp-pack.c: ptp_unpack_OI()
    static func from(_ data: Data) -> PTPObjectInfo? {
        guard data.count >= 52 else { return nil }  // Minimum size for fixed fields

        var offset = 0

        // Fixed-size fields (52 bytes total)
        let storageID = data.withUnsafeBytes { $0.loadUnaligned(fromByteOffset: offset, as: UInt32.self) }
        offset += 4

        let objectFormat = data.withUnsafeBytes { $0.loadUnaligned(fromByteOffset: offset, as: UInt16.self) }
        offset += 2

        let protectionStatus = data.withUnsafeBytes { $0.loadUnaligned(fromByteOffset: offset, as: UInt16.self) }
        offset += 2

        let objectCompressedSize = data.withUnsafeBytes { $0.loadUnaligned(fromByteOffset: offset, as: UInt32.self) }
        offset += 4

        let thumbFormat = data.withUnsafeBytes { $0.loadUnaligned(fromByteOffset: offset, as: UInt16.self) }
        offset += 2

        let thumbCompressedSize = data.withUnsafeBytes { $0.loadUnaligned(fromByteOffset: offset, as: UInt32.self) }
        offset += 4

        let thumbPixWidth = data.withUnsafeBytes { $0.loadUnaligned(fromByteOffset: offset, as: UInt32.self) }
        offset += 4

        let thumbPixHeight = data.withUnsafeBytes { $0.loadUnaligned(fromByteOffset: offset, as: UInt32.self) }
        offset += 4

        let imagePixWidth = data.withUnsafeBytes { $0.loadUnaligned(fromByteOffset: offset, as: UInt32.self) }
        offset += 4

        let imagePixHeight = data.withUnsafeBytes { $0.loadUnaligned(fromByteOffset: offset, as: UInt32.self) }
        offset += 4

        let imageBitDepth = data.withUnsafeBytes { $0.loadUnaligned(fromByteOffset: offset, as: UInt32.self) }
        offset += 4

        let parentObject = data.withUnsafeBytes { $0.loadUnaligned(fromByteOffset: offset, as: UInt32.self) }
        offset += 4

        let associationType = data.withUnsafeBytes { $0.loadUnaligned(fromByteOffset: offset, as: UInt16.self) }
        offset += 2

        let associationDesc = data.withUnsafeBytes { $0.loadUnaligned(fromByteOffset: offset, as: UInt32.self) }
        offset += 4

        let sequenceNumber = data.withUnsafeBytes { $0.loadUnaligned(fromByteOffset: offset, as: UInt32.self) }
        offset += 4

        // String fields (PTP string format: length byte + UTF-16LE chars)
        func readPTPString() -> String {
            guard offset < data.count else { return "" }
            let length = Int(data[offset])
            offset += 1

            if length == 0 { return "" }

            // Each character is 2 bytes (UTF-16LE), length includes null terminator
            let charCount = length - 1  // Exclude null terminator
            guard offset + (charCount * 2) <= data.count else { return "" }

            var characters: [UInt16] = []
            for _ in 0..<charCount {
                let char = data.withUnsafeBytes { $0.loadUnaligned(fromByteOffset: offset, as: UInt16.self) }
                characters.append(UInt16(littleEndian: char))
                offset += 2
            }
            // Skip null terminator
            offset += 2

            return String(utf16CodeUnits: characters, count: characters.count)
        }

        let filename = readPTPString()
        let captureDate = readPTPString()
        let modificationDate = readPTPString()
        let keywords = readPTPString()

        return PTPObjectInfo(
            storageID: UInt32(littleEndian: storageID),
            objectFormat: UInt16(littleEndian: objectFormat),
            protectionStatus: UInt16(littleEndian: protectionStatus),
            objectCompressedSize: UInt32(littleEndian: objectCompressedSize),
            thumbFormat: UInt16(littleEndian: thumbFormat),
            thumbCompressedSize: UInt32(littleEndian: thumbCompressedSize),
            thumbPixWidth: UInt32(littleEndian: thumbPixWidth),
            thumbPixHeight: UInt32(littleEndian: thumbPixHeight),
            imagePixWidth: UInt32(littleEndian: imagePixWidth),
            imagePixHeight: UInt32(littleEndian: imagePixHeight),
            imageBitDepth: UInt32(littleEndian: imageBitDepth),
            parentObject: UInt32(littleEndian: parentObject),
            associationType: UInt16(littleEndian: associationType),
            associationDesc: UInt32(littleEndian: associationDesc),
            sequenceNumber: UInt32(littleEndian: sequenceNumber),
            filename: filename,
            captureDate: captureDate,
            modificationDate: modificationDate,
            keywords: keywords
        )
    }
}

// MARK: - Helper Extensions

extension UInt8 {
    func toByteArray() -> [UInt8] {
        return [self]
    }
}

extension Data {
    /// Read UCS-2 little-endian null-terminated string (from libgphoto2 pattern)
    /// No length prefix - reads until null terminator (0x0000)
    func readUCS2String(at offset: Int) -> String? {
        guard offset + 2 <= count else { return nil }

        var characters: [UInt16] = []
        var currentOffset = offset

        // Read UCS-2 characters until null terminator
        while currentOffset + 2 <= count {
            let char = withUnsafeBytes { $0.loadUnaligned(fromByteOffset: currentOffset, as: UInt16.self) }
            let converted = UInt16(littleEndian: char)

            if converted == 0 {  // Null terminator
                break
            }

            characters.append(converted)
            currentOffset += 2
        }

        return String(utf16CodeUnits: characters, count: characters.count)
    }
}
