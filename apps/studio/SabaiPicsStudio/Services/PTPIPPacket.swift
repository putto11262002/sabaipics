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
