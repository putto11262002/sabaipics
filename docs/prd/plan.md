# Desktop Uploader MVP - Shippable Plan

## Slice 1: Desktop Foundation (shippable)
- [ ] Tauri app shell + routing
- [ ] Auth via system browser + localhost callback
- [ ] Secure token storage (keychain)
- [ ] Event list + create mapping UI (folder -> event)
- [ ] Token refresh note: Clerk session JWTs are short-lived; refresh via bridge page `getToken()` (no refresh token)

## Slice 2: Sync Engine v1 (shippable)
- [ ] File watcher + startup scan + stabilization
- [ ] Local SQLite job queue
- [ ] Presign -> PUT -> status polling
- [ ] Concurrency + basic retry handling

## Slice 3: Activity + Resilience (shippable)
- [ ] Activity page with status filter + retry
- [ ] Backoff policy (no retry limit, capped delay)
- [ ] Offline behavior: queue locally, show waiting, resume when online
- [ ] Tray menu (pause/resume, open app)

## Slice 4: Packaging + QA (shippable)
- [ ] Build packaging for target OS
- [ ] Smoke tests (large folders, flaky network)
- [ ] Basic logging + error surfacing
