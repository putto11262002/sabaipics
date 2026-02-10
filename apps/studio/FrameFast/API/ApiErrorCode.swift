//  ApiErrorCode.swift
//  FrameFast
//
//  Mirrors apps/api/src/lib/error/index.ts ApiErrorCode.
//

import Foundation

enum ApiErrorCode: Sendable, Equatable, Codable {
    // Client errors (4xx)
    case badRequest
    case unauthorized
    case unauthenticated
    case paymentRequired
    case forbidden
    case notFound
    case conflict
    case gone
    case payloadTooLarge
    case unprocessable
    case rateLimited

    // Server errors (5xx)
    case internalError
    case badGateway
    case serviceUnavailable

    case unknown(String)

    init(rawValue: String) {
        switch rawValue {
        case "BAD_REQUEST": self = .badRequest
        case "UNAUTHORIZED": self = .unauthorized
        case "UNAUTHENTICATED": self = .unauthenticated
        case "PAYMENT_REQUIRED": self = .paymentRequired
        case "FORBIDDEN": self = .forbidden
        case "NOT_FOUND": self = .notFound
        case "CONFLICT": self = .conflict
        case "GONE": self = .gone
        case "PAYLOAD_TOO_LARGE": self = .payloadTooLarge
        case "UNPROCESSABLE": self = .unprocessable
        case "RATE_LIMITED": self = .rateLimited
        case "INTERNAL_ERROR": self = .internalError
        case "BAD_GATEWAY": self = .badGateway
        case "SERVICE_UNAVAILABLE": self = .serviceUnavailable
        default: self = .unknown(rawValue)
        }
    }

    var rawValue: String {
        switch self {
        case .badRequest: return "BAD_REQUEST"
        case .unauthorized: return "UNAUTHORIZED"
        case .unauthenticated: return "UNAUTHENTICATED"
        case .paymentRequired: return "PAYMENT_REQUIRED"
        case .forbidden: return "FORBIDDEN"
        case .notFound: return "NOT_FOUND"
        case .conflict: return "CONFLICT"
        case .gone: return "GONE"
        case .payloadTooLarge: return "PAYLOAD_TOO_LARGE"
        case .unprocessable: return "UNPROCESSABLE"
        case .rateLimited: return "RATE_LIMITED"
        case .internalError: return "INTERNAL_ERROR"
        case .badGateway: return "BAD_GATEWAY"
        case .serviceUnavailable: return "SERVICE_UNAVAILABLE"
        case .unknown(let v): return v
        }
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        let value = try container.decode(String.self)
        self = ApiErrorCode(rawValue: value)
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(rawValue)
    }
}
