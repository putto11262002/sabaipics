import CryptoKit
import Foundation

actor DiskCache {
    private let directoryURL: URL
    private let encoder: JSONEncoder
    private let decoder: JSONDecoder

    init(directoryName: String, version: String = "v1") {
        let caches = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first!
        self.directoryURL = caches.appendingPathComponent(directoryName, isDirectory: true).appendingPathComponent(version, isDirectory: true)

        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.withoutEscapingSlashes]
        self.encoder = encoder

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        self.decoder = decoder
    }

    func readEntry<Value: Codable>(key: String, as type: Value.Type = Value.self) -> CacheEntry<Value>? {
        let url = fileURL(forKey: key)
        guard let data = try? Data(contentsOf: url) else { return nil }
        return try? decoder.decode(CacheEntry<Value>.self, from: data)
    }

    func writeEntry<Value: Codable>(key: String, entry: CacheEntry<Value>) {
        do {
            try FileManager.default.createDirectory(at: directoryURL, withIntermediateDirectories: true)
            let data = try encoder.encode(entry)
            let url = fileURL(forKey: key)
            try data.write(to: url, options: [.atomic])
        } catch {
            print("[DiskCache] Write failed (\(key)): \(error)")
        }
    }

    func delete(key: String) {
        let url = fileURL(forKey: key)
        try? FileManager.default.removeItem(at: url)
    }

    private func fileURL(forKey key: String) -> URL {
        directoryURL.appendingPathComponent("\(hashedFilename(forKey: key)).json", isDirectory: false)
    }

    private func hashedFilename(forKey key: String) -> String {
        let digest = SHA256.hash(data: Data(key.utf8))
        return digest.map { String(format: "%02x", $0) }.joined()
    }
}

