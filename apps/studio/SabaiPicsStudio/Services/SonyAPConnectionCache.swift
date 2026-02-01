//  SonyAPConnectionCache.swift
//  SabaiPicsStudio
//
//  Stores last-known working camera info for Sony AP-mode networks.
//  Designed for a "previous cameras" list + quick reconnect.
//

import Foundation
import NetworkExtension

struct SonyAPConnectionRecord: Codable, Equatable, Identifiable {
    let id: String

    var cameraName: String
    var lastKnownCameraIP: String
    var lastConnectedAt: Date

    // Optional metadata (best-effort)
    var ssid: String?
    var cameraId: String?
    var networkKey: String?
}

struct SonyAPPendingJoinInfo: Codable, Equatable {
    let networkKey: String
    let ssid: String
    let cameraId: String?
    let createdAt: Date
}

final class SonyAPConnectionCache {
    static let shared = SonyAPConnectionCache()

    private let storageKey = "SonyAP.ConnectionCache.v2"
    private let legacyStorageKey = "SonyAP.ConnectionCache.v1"
    private let pendingKey = "SonyAP.PendingJoinInfo.v1"

    private init() {
        migrateIfNeeded()
    }

    func hasEverConnected() -> Bool {
        !loadAllById().isEmpty
    }

    func listRecords() -> [SonyAPConnectionRecord] {
        loadAllById().values.sorted(by: { $0.lastConnectedAt > $1.lastConnectedAt })
    }

    func mostRecentRecord() -> SonyAPConnectionRecord? {
        listRecords().first
    }

    func loadCurrentNetworkRecord() -> SonyAPConnectionRecord? {
        guard let key = currentNetworkKey() else { return nil }
        return listRecords().first(where: { $0.networkKey == key })
    }

    func savePendingJoinInfoForCurrentNetwork(ssid: String, cameraId: String?) {
        guard let key = currentNetworkKey() else { return }
        let pending = SonyAPPendingJoinInfo(networkKey: key, ssid: ssid, cameraId: cameraId, createdAt: Date())
        guard let data = try? JSONEncoder().encode(pending) else { return }
        UserDefaults.standard.set(data, forKey: pendingKey)
    }

    func consumePendingJoinInfoIfMatchesCurrentNetwork() -> (ssid: String, cameraId: String?)? {
        guard let key = currentNetworkKey() else { return nil }
        guard let data = UserDefaults.standard.data(forKey: pendingKey) else { return nil }
        guard let pending = try? JSONDecoder().decode(SonyAPPendingJoinInfo.self, from: data) else { return nil }
        guard pending.networkKey == key else { return nil }

        UserDefaults.standard.removeObject(forKey: pendingKey)
        return (ssid: pending.ssid, cameraId: pending.cameraId)
    }

    func saveCurrentNetwork(ip: String, cameraName: String) {
        let pending = consumePendingJoinInfoIfMatchesCurrentNetwork()
        saveCurrentNetwork(ip: ip, cameraName: cameraName, ssid: pending?.ssid, cameraId: pending?.cameraId)
    }

    func saveCurrentNetwork(ip: String, cameraName: String, ssid: String?, cameraId: String?) {
        let now = Date()
        let key = currentNetworkKey()

        var all = loadAllById()

        // Prefer matching by cameraId (from QR), else by ssid, else by (name+network).
        let existingId: String? = {
            if let cameraId {
                return all.values.first(where: { $0.cameraId == cameraId })?.id
            }
            if let ssid {
                return all.values.first(where: { $0.ssid == ssid })?.id
            }
            return all.values.first(where: { $0.cameraName == cameraName && $0.networkKey == key })?.id
        }()

        if let existingId, var record = all[existingId] {
            record.cameraName = cameraName
            record.lastKnownCameraIP = ip
            record.lastConnectedAt = now
            if record.networkKey == nil { record.networkKey = key }
            if record.ssid == nil { record.ssid = ssid }
            if record.cameraId == nil { record.cameraId = cameraId }
            all[existingId] = record
        } else {
            let id = UUID().uuidString
            all[id] = SonyAPConnectionRecord(
                id: id,
                cameraName: cameraName,
                lastKnownCameraIP: ip,
                lastConnectedAt: now,
                ssid: ssid,
                cameraId: cameraId,
                networkKey: key
            )
        }

        saveAllById(all)
    }

    @MainActor
    func deleteRecord(id: String) {
        var all = loadAllById()
        let record = all[id]
        all.removeValue(forKey: id)
        saveAllById(all)

        if let ssid = record?.ssid {
            // Best-effort: removes the app-managed configuration if present.
            NEHotspotConfigurationManager.shared.removeConfiguration(forSSID: ssid)
        }
    }

    func currentNetworkKey() -> String? {
        guard let wifi = WiFiNetworkInfo.currentWiFiIPv4() else {
            return nil
        }

        // Use subnet base + mask as a stable signature without requiring SSID.
        return "subnet:\(wifi.subnetBaseString)/\(wifi.netmaskString)"
    }

    private func loadAllById() -> [String: SonyAPConnectionRecord] {
        guard let data = UserDefaults.standard.data(forKey: storageKey) else {
            return [:]
        }
        return (try? JSONDecoder().decode([String: SonyAPConnectionRecord].self, from: data)) ?? [:]
    }

    private func saveAllById(_ value: [String: SonyAPConnectionRecord]) {
        guard let data = try? JSONEncoder().encode(value) else { return }
        UserDefaults.standard.set(data, forKey: storageKey)
    }

    private struct LegacyRecordV1: Codable, Equatable {
        let lastKnownCameraIP: String
        let cameraName: String
        let lastConnectedAt: Date
    }

    private func migrateIfNeeded() {
        // If v2 already exists, do nothing.
        if UserDefaults.standard.data(forKey: storageKey) != nil {
            return
        }

        guard let legacyData = UserDefaults.standard.data(forKey: legacyStorageKey) else {
            return
        }

        // Legacy format was [networkKey: LegacyRecordV1]
        guard let legacy = try? JSONDecoder().decode([String: LegacyRecordV1].self, from: legacyData) else {
            return
        }

        var migrated: [String: SonyAPConnectionRecord] = [:]
        for (networkKey, rec) in legacy {
            let id = UUID().uuidString
            migrated[id] = SonyAPConnectionRecord(
                id: id,
                cameraName: rec.cameraName,
                lastKnownCameraIP: rec.lastKnownCameraIP,
                lastConnectedAt: rec.lastConnectedAt,
                ssid: nil,
                cameraId: nil,
                networkKey: networkKey
            )
        }

        saveAllById(migrated)
    }
}
