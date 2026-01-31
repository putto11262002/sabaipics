//
//  PTPIPCommand.swift
//  SabaiPicsStudio
//
//  Created: 2026-01-19
//  PTP command codes and structures
//  Based on libgphoto2's ptp.h and ptp-pack.c
//

import Foundation

// MARK: - PTP Operation Codes
// From libgphoto2: camlibs/ptp2/ptp.h

/// Standard PTP operation codes (ISO 15740)
enum PTPOperationCode: UInt16 {
    // Session Management
    case getDeviceInfo = 0x1001
    case openSession = 0x1002
    case closeSession = 0x1003

    // Object Operations
    case getStorageIDs = 0x1004
    case getStorageInfo = 0x1005
    case getNumObjects = 0x1006
    case getObjectHandles = 0x1007
    case getObjectInfo = 0x1008
    case getObject = 0x1009
    case getPartialObject = 0x101B
    case deleteObject = 0x100B
    case getDevicePropDesc = 0x1014

    // Canon EOS Extensions (for Canon cameras)
    case canonEOSGetEvent = 0x9116
    case canonEOSSetRemoteMode = 0x9114
    case canonEOSSetEventMode = 0x9115  // Enable/disable event reporting
    case canonEOSGetStorageIDs = 0x9101
    case canonEOSGetStorageInfo = 0x9102
    case canonEOSGetObject = 0x9104
    case canonEOSRemoteRelease = 0x910F

    // Sony Extensions
    case sonySDIOConnect = 0x9201
    case sonyGetSDIOGetExtDeviceInfo = 0x9202

    /// Human-readable operation name for logging
    var name: String {
        switch self {
        case .getDeviceInfo: return "GetDeviceInfo"
        case .openSession: return "OpenSession"
        case .closeSession: return "CloseSession"
        case .getStorageIDs: return "GetStorageIDs"
        case .getStorageInfo: return "GetStorageInfo"
        case .getNumObjects: return "GetNumObjects"
        case .getObjectHandles: return "GetObjectHandles"
        case .getObjectInfo: return "GetObjectInfo"
        case .getObject: return "GetObject"
        case .getPartialObject: return "GetPartialObject"
        case .deleteObject: return "DeleteObject"
        case .getDevicePropDesc: return "GetDevicePropDesc"
        case .canonEOSGetEvent: return "Canon_EOS_GetEvent"
        case .canonEOSSetRemoteMode: return "Canon_EOS_SetRemoteMode"
        case .canonEOSSetEventMode: return "Canon_EOS_SetEventMode"
        case .canonEOSGetStorageIDs: return "Canon_EOS_GetStorageIDs"
        case .canonEOSGetStorageInfo: return "Canon_EOS_GetStorageInfo"
        case .canonEOSGetObject: return "Canon_EOS_GetObject"
        case .canonEOSRemoteRelease: return "Canon_EOS_RemoteRelease"
        case .sonySDIOConnect: return "Sony_SDIOConnect"
        case .sonyGetSDIOGetExtDeviceInfo: return "Sony_GetSDIOGetExtDeviceInfo"
        }
    }
}

// MARK: - PTP Response Codes
// From libgphoto2: response code constants

/// PTP response codes
enum PTPResponseCode: UInt16 {
    case ok = 0x2001
    case generalError = 0x2002
    case sessionNotOpen = 0x2003
    case invalidTransactionID = 0x2004
    case operationNotSupported = 0x2005
    case parameterNotSupported = 0x2006
    case incompleteTransfer = 0x2007
    case invalidStorageID = 0x2008
    case invalidObjectHandle = 0x2009
    case deviceBusy = 0x2019
    case invalidParentObject = 0x201A
    case invalidParameter = 0x201D
    case sessionAlreadyOpen = 0x201E
    case transactionCancelled = 0x201F
    case specificationOfDestinationUnsupported = 0x2020
    case storeNotAvailable = 0x2013

    var isSuccess: Bool {
        return self == .ok
    }

    var errorDescription: String {
        switch self {
        case .ok: return "Success"
        case .generalError: return "General error"
        case .sessionNotOpen: return "Session not open"
        case .invalidTransactionID: return "Invalid transaction ID"
        case .operationNotSupported: return "Operation not supported"
        case .parameterNotSupported: return "Parameter not supported"
        case .incompleteTransfer: return "Incomplete transfer"
        case .invalidStorageID: return "Invalid storage ID"
        case .invalidObjectHandle: return "Invalid object handle"
        case .deviceBusy: return "Device busy"
        case .invalidParentObject: return "Invalid parent object"
        case .invalidParameter: return "Invalid parameter"
        case .sessionAlreadyOpen: return "Session already open"
        case .transactionCancelled: return "Transaction cancelled"
        case .specificationOfDestinationUnsupported: return "Destination unsupported"
        case .storeNotAvailable: return "Store not available"
        }
    }

    /// Human-readable response code name for logging
    var name: String {
        switch self {
        case .ok: return "OK"
        case .generalError: return "GeneralError"
        case .sessionNotOpen: return "SessionNotOpen"
        case .invalidTransactionID: return "InvalidTransactionID"
        case .operationNotSupported: return "OperationNotSupported"
        case .parameterNotSupported: return "ParameterNotSupported"
        case .incompleteTransfer: return "IncompleteTransfer"
        case .invalidStorageID: return "InvalidStorageID"
        case .invalidObjectHandle: return "InvalidObjectHandle"
        case .deviceBusy: return "DeviceBusy"
        case .invalidParentObject: return "InvalidParentObject"
        case .invalidParameter: return "InvalidParameter"
        case .sessionAlreadyOpen: return "SessionAlreadyOpen"
        case .transactionCancelled: return "TransactionCancelled"
        case .specificationOfDestinationUnsupported: return "DestinationUnsupported"
        case .storeNotAvailable: return "StoreNotAvailable"
        }
    }
}

// MARK: - PTP Event Codes
// From libgphoto2: event code constants

/// PTP event codes
enum PTPEventCode: UInt16 {
    case undefined = 0x4000
    case cancelTransaction = 0x4001
    case objectAdded = 0x4002
    case objectRemoved = 0x4003
    case storeAdded = 0x4004
    case storeRemoved = 0x4005
    case devicePropChanged = 0x4006
    case objectInfoChanged = 0x4007
    case deviceInfoChanged = 0x4008
    case requestObjectTransfer = 0x4009
    case storeFull = 0x400A
    case deviceReset = 0x400B
    case storageInfoChanged = 0x400C
    case captureComplete = 0x400D

    // Canon EOS Events
    case canonEOSObjectAddedEx = 0xC181
    case canonEOSPropValueChanged = 0xC189
    case canonEOSRequestGetEvent = 0xC101

    // Sony PTP/IP Events (observed on ILCE models)
    // Based on Rocc's Sony mapping and device logs
    case sonyObjectAdded = 0xC201
    case sonyObjectRemoved = 0xC202
    case sonyPropertyChanged = 0xC203
    case sonyUnknown3 = 0xC206
    case sonyUnknown4 = 0xC207
    case sonyUnknown5 = 0xC20C
}

// MARK: - PTP Command Builder
// Convenience builder for creating PTP commands

/// Helper for building PTP/IP operation request packets
struct PTPCommand {
    private var transactionID: UInt32
    private let sessionID: UInt32

    init(sessionID: UInt32, initialTransactionID: UInt32 = 1) {
        self.sessionID = sessionID
        self.transactionID = initialTransactionID
    }

    /// Get next transaction ID (auto-increment)
    mutating func nextTransactionID() -> UInt32 {
        let id = transactionID
        // Wrap to 1 on overflow (avoid 0 and prevent trap)
        transactionID = (transactionID == UInt32.max) ? 1 : transactionID + 1
        return id
    }

    /// Build GetObject command
    /// - Parameter objectHandle: Object handle to retrieve
    /// - Returns: PTPIPOperationRequest packet
    mutating func getObject(handle: UInt32) -> PTPIPOperationRequest {
        return PTPIPOperationRequest(
            dataPhaseInfo: 1,  // 1 = receive or no data, 2 = send data (per libgphoto2)
            operationCode: PTPOperationCode.getObject.rawValue,
            transactionID: nextTransactionID(),
            parameters: [handle]
        )
    }

    /// Build GetPartialObject command
    /// PTP GetPartialObject: handle + offset + maxBytes
    mutating func getPartialObject(handle: UInt32, offset: UInt32, maxBytes: UInt32) -> PTPIPOperationRequest {
        return PTPIPOperationRequest(
            dataPhaseInfo: 1,  // Receive data from camera
            operationCode: PTPOperationCode.getPartialObject.rawValue,
            transactionID: nextTransactionID(),
            parameters: [handle, offset, maxBytes]
        )
    }

    /// Build Canon EOS GetObject command (for Canon cameras)
    /// - Parameter objectHandle: Object handle to retrieve
    /// - Returns: PTPIPOperationRequest packet
    mutating func canonGetObject(handle: UInt32) -> PTPIPOperationRequest {
        return PTPIPOperationRequest(
            dataPhaseInfo: 1,  // 1 = receive or no data, 2 = send data (per libgphoto2)
            operationCode: PTPOperationCode.canonEOSGetObject.rawValue,
            transactionID: nextTransactionID(),
            parameters: [handle]
        )
    }

    /// Build CloseSession command
    /// - Returns: PTPIPOperationRequest packet
    mutating func closeSession() -> PTPIPOperationRequest {
        return PTPIPOperationRequest(
            dataPhaseInfo: 1,  // 1 = receive or no data, 2 = send data (per libgphoto2)
            operationCode: PTPOperationCode.closeSession.rawValue,
            transactionID: nextTransactionID(),
            parameters: []
        )
    }

    /// Build GetDeviceInfo command
    /// - Returns: PTPIPOperationRequest packet
    mutating func getDeviceInfo() -> PTPIPOperationRequest {
        return PTPIPOperationRequest(
            dataPhaseInfo: 1,  // 1 = receive or no data, 2 = send data (per libgphoto2)
            operationCode: PTPOperationCode.getDeviceInfo.rawValue,
            transactionID: nextTransactionID(),
            parameters: []
        )
    }

    /// Build GetStorageIDs command
    /// - Returns: PTPIPOperationRequest packet
    mutating func getStorageIDs() -> PTPIPOperationRequest {
        return PTPIPOperationRequest(
            dataPhaseInfo: 1,  // 1 = receive or no data, 2 = send data (per libgphoto2)
            operationCode: PTPOperationCode.getStorageIDs.rawValue,
            transactionID: nextTransactionID(),
            parameters: []
        )
    }

    /// Build GetStorageInfo command
    /// - Parameter storageID: Storage ID to query
    /// - Returns: PTPIPOperationRequest packet
    mutating func getStorageInfo(storageID: UInt32) -> PTPIPOperationRequest {
        return PTPIPOperationRequest(
            dataPhaseInfo: 1,  // 1 = receive or no data, 2 = send data (per libgphoto2)
            operationCode: PTPOperationCode.getStorageInfo.rawValue,
            transactionID: nextTransactionID(),
            parameters: [storageID]
        )
    }

    /// Build GetObjectHandles command
    /// - Parameters:
    ///   - storageID: Storage ID to query (0x00000000 for all)
    ///   - objectFormat: Object format code (0x0000 for all)
    ///   - associationObject: Parent handle (0xFFFFFFFF for root)
    /// - Returns: PTPIPOperationRequest packet
    mutating func getObjectHandles(
        storageID: UInt32,
        objectFormat: UInt16 = 0x0000,
        associationObject: UInt32 = 0xFFFFFFFF
    ) -> PTPIPOperationRequest {
        let objectFormatParam = UInt32(objectFormat)
        return PTPIPOperationRequest(
            dataPhaseInfo: 1,  // 1 = receive or no data, 2 = send data (per libgphoto2)
            operationCode: PTPOperationCode.getObjectHandles.rawValue,
            transactionID: nextTransactionID(),
            parameters: [storageID, objectFormatParam, associationObject]
        )
    }

    /// Build GetDevicePropDesc command
    /// PTP GetDevicePropDesc: propCode
    mutating func getDevicePropDesc(propCode: UInt16) -> PTPIPOperationRequest {
        return PTPIPOperationRequest(
            dataPhaseInfo: 1,
            operationCode: PTPOperationCode.getDevicePropDesc.rawValue,
            transactionID: nextTransactionID(),
            parameters: [UInt32(propCode)]
        )
    }

    /// Build Canon EOS GetEvent command (for polling events)
    /// - Returns: PTPIPOperationRequest packet
    mutating func canonGetEvent() -> PTPIPOperationRequest {
        return PTPIPOperationRequest(
            dataPhaseInfo: 2,  // 2 = PTP_DP_GETDATA (receive data from camera)
            operationCode: PTPOperationCode.canonEOSGetEvent.rawValue,
            transactionID: nextTransactionID(),
            parameters: []
        )
    }

    /// Build Sony SDIOConnect command
    /// - Parameters:
    ///   - p1: Phase (1/2/3)
    ///   - p2: Optional value (usually 0)
    ///   - p3: Optional value (usually 0)
    /// - Returns: PTPIPOperationRequest packet
    mutating func sonySDIOConnect(p1: UInt32, p2: UInt32 = 0, p3: UInt32 = 0) -> PTPIPOperationRequest {
        return PTPIPOperationRequest(
            // libgphoto2 uses PTP_DP_GETDATA for this opcode
            dataPhaseInfo: 2,
            operationCode: PTPOperationCode.sonySDIOConnect.rawValue,
            transactionID: nextTransactionID(),
            parameters: [p1, p2, p3]
        )
    }

    /// Build Sony GetSDIOGetExtDeviceInfo command
    /// From libgphoto2: PTP_OC_SONY_GetSDIOGetExtDeviceInfo (0x9202) param 0xC8
    mutating func sonyGetSDIOGetExtDeviceInfo(param: UInt32 = 0x000000C8) -> PTPIPOperationRequest {
        return PTPIPOperationRequest(
            // This opcode returns data (vendor prop/ops/event codes)
            dataPhaseInfo: 2,
            operationCode: PTPOperationCode.sonyGetSDIOGetExtDeviceInfo.rawValue,
            transactionID: nextTransactionID(),
            parameters: [param]
        )
    }

    /// Build OpenSession command
    /// - Returns: PTPIPOperationRequest packet
    mutating func openSession() -> PTPIPOperationRequest {
        return PTPIPOperationRequest(
            dataPhaseInfo: 1,  // 1 = receive or no data, 2 = send data (per libgphoto2)
            operationCode: PTPOperationCode.openSession.rawValue,
            transactionID: nextTransactionID(),
            parameters: [sessionID]
        )
    }

    /// Build Canon EOS SetRemoteMode command
    /// - Parameter mode: 1=PC remote, 0=normal
    /// - Returns: PTPIPOperationRequest packet
    mutating func canonSetRemoteMode(mode: UInt32 = 1) -> PTPIPOperationRequest {
        return PTPIPOperationRequest(
            dataPhaseInfo: 1,  // 1 = receive or no data, 2 = send data (per libgphoto2)
            operationCode: PTPOperationCode.canonEOSSetRemoteMode.rawValue,
            transactionID: nextTransactionID(),
            parameters: [mode]
        )
    }

    /// Build Canon EOS SetEventMode command
    /// - Parameter mode: 1=enable event reporting, 0=disable
    /// - Returns: PTPIPOperationRequest packet
    /// - Note: This MUST be called after OpenSession and SetRemoteMode to enable
    ///         the camera to report events (ObjectAdded, etc.) in GetEvent responses.
    ///         Without this, GetEvent always returns empty (8-byte terminator).
    mutating func canonSetEventMode(mode: UInt32 = 1) -> PTPIPOperationRequest {
        return PTPIPOperationRequest(
            dataPhaseInfo: 1,  // No data phase, just command + response
            operationCode: PTPOperationCode.canonEOSSetEventMode.rawValue,
            transactionID: nextTransactionID(),
            parameters: [mode]
        )
    }

    /// Build GetObjectInfo command
    /// - Parameter objectHandle: Object handle to get info for
    /// - Returns: PTPIPOperationRequest packet
    mutating func getObjectInfo(handle: UInt32) -> PTPIPOperationRequest {
        return PTPIPOperationRequest(
            dataPhaseInfo: 1,  // 1 = receive data from camera
            operationCode: PTPOperationCode.getObjectInfo.rawValue,
            transactionID: nextTransactionID(),
            parameters: [handle]
        )
    }
}

// MARK: - Transaction Manager
// Thread-safe transaction ID management

/// Manages transaction IDs for PTP commands
/// Ensures thread-safe ID generation for concurrent operations
actor PTPTransactionManager {
    private var nextID: UInt32 = 1
    private let sessionID: UInt32

    init(sessionID: UInt32) {
        self.sessionID = sessionID
    }

    /// Create a command builder with current state
    ///
    /// Note: `PTPCommand` can generate multiple transaction IDs internally.
    /// To prevent collisions between concurrent command builders, we reserve
    /// a block of IDs per builder.
    func createCommand(reserve count: UInt32 = 32) async -> PTPCommand {
        let start = nextID
        let increment = max(count, 1)

        // Reserve a block; wrap to 1 (avoid 0)
        if nextID >= UInt32.max - increment {
            nextID = 1
        } else {
            nextID += increment
        }

        return PTPCommand(sessionID: sessionID, initialTransactionID: start)
    }
}
