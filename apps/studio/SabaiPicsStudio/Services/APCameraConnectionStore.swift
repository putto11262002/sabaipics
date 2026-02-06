//  SabaiPicsStudio
//
//  Unified persistence for previously connected AP-mode cameras.
//  Replaces brand-specific caches (e.g. Sony AP cache) over time.
//

import Foundation
#if os(iOS)
import NetworkExtension
#endif

struct APCameraConnectionRecord: Codable, Equatable, Identifiable {
    let id: UUID

    var manufacturer: CameraManufacturer
    var cameraName: String
    var lastKnownCameraIP: String
    var lastConnectedAt: Date

    // Optional metadata (best-effort)
    var ssid: String?
    var cameraId: String?
    var networkKey: String?
}

final class APCameraConnectionStore {
    static let shared = APCameraConnectionStore()

    private let storageKey = "APCamera.ConnectionStore.v1"

    private init() {}

    func listRecords(manufacturer: CameraManufacturer? = nil) -> [APCameraConnectionRecord] {
        let records = loadAllById().values
        let filtered: [APCameraConnectionRecord]
        if let manufacturer {
            filtered = records.filter { $0.manufacturer == manufacturer }
        } else {
            filtered = Array(records)
        }
        return filtered.sorted(by: { $0.lastConnectedAt > $1.lastConnectedAt })
    }

    func mostRecentRecord(manufacturer: CameraManufacturer? = nil) -> APCameraConnectionRecord? {
        listRecords(manufacturer: manufacturer).first
    }

    func loadCurrentNetworkRecord(manufacturer: CameraManufacturer? = nil) -> APCameraConnectionRecord? {
        guard let key = WiFiNetworkInfo.currentNetworkKey() else { return nil }
        return listRecords(manufacturer: manufacturer).first(where: { $0.networkKey == key })
    }

    func saveCurrentNetwork(
        manufacturer: CameraManufacturer,
        ip: String,
        cameraName: String,
        ssid: String? = nil,
        cameraId: String? = nil
    ) {
        let networkKey = WiFiNetworkInfo.currentNetworkKey()
        var all = loadAllById()

        // If we already have a record for this network+cameraName, update it.
        if let key = networkKey {
            let existing = all.values.first(where: { record in
                record.manufacturer == manufacturer && record.networkKey == key && record.cameraName == cameraName
            })

            if let existing {
            var updated = existing
            updated.lastKnownCameraIP = ip
            updated.lastConnectedAt = Date()
            updated.ssid = ssid ?? updated.ssid
            updated.cameraId = cameraId ?? updated.cameraId
            updated.networkKey = key
            all[updated.id] = updated
            saveAllById(all)
            return
            }
        }

        let record = APCameraConnectionRecord(
            id: UUID(),
            manufacturer: manufacturer,
            cameraName: cameraName,
            lastKnownCameraIP: ip,
            lastConnectedAt: Date(),
            ssid: ssid,
            cameraId: cameraId,
            networkKey: networkKey
        )

        all[record.id] = record
        saveAllById(all)
    }

    func deleteRecord(id: UUID) {
        var all = loadAllById()
        let record = all[id]
        all.removeValue(forKey: id)
        saveAllById(all)

        #if os(iOS)
        if let ssid = record?.ssid {
            // Best-effort: removes the app-managed configuration if present.
            NEHotspotConfigurationManager.shared.removeConfiguration(forSSID: ssid)
        }
        #endif
    }

    func clear(manufacturer: CameraManufacturer? = nil) {
        guard let manufacturer else {
            UserDefaults.standard.removeObject(forKey: storageKey)
            return
        }
        var all = loadAllById()
        let toDelete = all.values.filter { $0.manufacturer == manufacturer }.map { $0.id }
        for id in toDelete {
            deleteRecord(id: id)
        }
    }

    private func loadAllById() -> [UUID: APCameraConnectionRecord] {
        guard let data = UserDefaults.standard.data(forKey: storageKey) else {
            return [:]
        }
        return (try? JSONDecoder().decode([UUID: APCameraConnectionRecord].self, from: data)) ?? [:]
    }

    private func saveAllById(_ value: [UUID: APCameraConnectionRecord]) {
        guard let data = try? JSONEncoder().encode(value) else { return }
        UserDefaults.standard.set(data, forKey: storageKey)
    }
}
