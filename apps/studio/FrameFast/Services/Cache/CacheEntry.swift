import Foundation

struct CacheEntry<Value: Codable>: Codable {
    let fetchedAt: Date
    let value: Value
}

