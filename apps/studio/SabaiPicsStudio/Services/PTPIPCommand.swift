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
    case deleteObject = 0x100B

    // Canon EOS Extensions (for Canon cameras)
    case canonEOSGetEvent = 0x9116
    case canonEOSSetRemoteMode = 0x9114
    case canonEOSSetEventMode = 0x9115  // Enable/disable event reporting
    case canonEOSGetStorageIDs = 0x9101
    case canonEOSGetStorageInfo = 0x9102
    case canonEOSGetObject = 0x9104
    case canonEOSRemoteRelease = 0x910F
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

    /// Get next transaction ID
    func next() -> UInt32 {
        let id = nextID
        nextID = (nextID == UInt32.max) ? 1 : nextID + 1
        return id
    }

    /// Create a command builder with current state
    func createCommand() async -> PTPCommand {
        let txID = await next()
        return PTPCommand(sessionID: sessionID, initialTransactionID: txID)
    }
}
