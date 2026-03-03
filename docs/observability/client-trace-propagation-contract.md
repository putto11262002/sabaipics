# Client Trace Propagation Contract

This contract defines the required request headers for client-to-API calls from Dashboard (web) and Studio (iOS).

## Required headers

- `traceparent`: W3C Trace Context header (`00-<trace-id>-<span-id>-01`)
- `baggage`: comma-separated key/value pairs

## Baggage keys

- `app=framefast`
- `client=<dashboard|ios>`
- `client_platform=<web|ios>`
- `route=<url-encoded route/path>` (optional but recommended)

## Rules

1. If `traceparent`/`baggage` already exist, keep them and do not overwrite.
2. Generate new root context only when no incoming context is available on the client request.
3. Apply these headers only to API requests, not to direct R2 `PUT` presigned uploads.
4. For upload flow continuity, ensure the `POST /uploads/presign` request includes this context.

## Current implementations

- Dashboard: `src/dashboard/src/lib/tracing-fetch.ts`
- iOS Studio: `studio/FrameFast/API/TraceContext.swift`
