# Future Exploration: Concurrent Event Monitoring + Downloads

**Date:** 2026-01-15
**Status:** Future Optimization (Not for MVP)
**Related:** log/004-gphoto2-concurrent-download-fix.md

## Idea

Explore making event monitoring and downloads run in **separate threads** using mutex-based synchronization, so that:

- ✅ Event monitoring is **non-blocking** (continues during downloads)
- ✅ Downloads happen **concurrently** without blocking event detection
- ✅ Better responsiveness during burst shooting

## Current Sequential Architecture (MVP)

```
Monitoring Thread (single thread):
  Loop:
    1. gp_camera_wait_for_event() → Detect photo
    2. Add to download queue
    3. Process queue → gp_camera_file_get() → Download
    4. Repeat

Timeline:
  Event (0ms) → Detect (100ms) → Download (2000ms) → Next Event (2100ms)

Problem: Event monitoring paused during 2-second download
```

## Proposed Concurrent Architecture

```
Thread 1: Event Monitoring (dedicated, never blocks)
  Loop:
    1. Lock camera mutex
    2. gp_camera_wait_for_event(timeout=0) → Non-blocking poll
    3. Unlock camera mutex
    4. If photo detected → Add to download queue
    5. Sleep 100ms
    6. Repeat

Thread Pool: Download Workers (2-3 threads)
  Loop:
    1. Wait for item in download queue
    2. Lock camera mutex
    3. gp_camera_file_get() → Download
    4. Unlock camera mutex
    5. Notify completion
    6. Repeat

Timeline:
  Event (0ms) → Detect (100ms) → Queue → Continue monitoring
  Download Thread → Process queue concurrently (2000ms)

Benefit: Next event detected at 200ms, not 2100ms
```

## Technical Approach

### 1. Add NSLock for Camera Access

```objc
@interface WiFiCameraManager ()
@property (nonatomic, strong) NSLock *cameraLock;
@property (nonatomic, strong) NSOperationQueue *downloadQueue;
@property (nonatomic, strong) NSThread *monitoringThread;
@end
```

### 2. Non-Blocking Event Monitoring

**Key change:** Use `timeout=0` for `gp_camera_wait_for_event()`

```objc
- (void)monitoringLoop {
    while (_isMonitoring) {
        @autoreleasepool {
            CameraEventType evttype;
            void *evtdata = NULL;

            // Lock camera access
            [_cameraLock lock];

            // NON-BLOCKING poll (timeout=0)
            int ret = gp_camera_wait_for_event(_camera, 0, &evttype, &evtdata, _context);

            // Unlock immediately
            [_cameraLock unlock];

            if (ret == GP_OK && evttype == GP_EVENT_FILE_ADDED) {
                CameraFilePath *path = (CameraFilePath*)evtdata;
                NSString *filename = [NSString stringWithUTF8String:path->name];
                NSString *folder = [NSString stringWithUTF8String:path->folder];

                // Queue download (non-blocking)
                [self queueDownload:filename folder:folder];
            }

            if (evtdata) free(evtdata);

            // Sleep briefly to avoid tight loop (100ms)
            [NSThread sleepForTimeInterval:0.1];
        }
    }
}
```

### 3. Concurrent Download Queue

```objc
- (void)queueDownload:(NSString *)filename folder:(NSString *)folder {
    // Create download operation
    NSBlockOperation *downloadOp = [NSBlockOperation blockOperationWithBlock:^{
        [self downloadFileWithLock:filename folder:folder];
    }];

    // Add to queue (max 3 concurrent downloads)
    [_downloadQueue addOperation:downloadOp];
}

- (void)downloadFileWithLock:(NSString *)filename folder:(NSString *)folder {
    // Lock camera access
    [_cameraLock lock];

    NSLog(@"📥 Downloading (thread: %@): %@", [NSThread currentThread], filename);

    CameraFile *file;
    gp_file_new(&file);

    int ret = gp_camera_file_get(_camera,
                                [folder UTF8String],
                                [filename UTF8String],
                                GP_FILE_TYPE_NORMAL,
                                file,
                                _context);

    // Unlock camera access
    [_cameraLock unlock];

    if (ret == GP_OK) {
        // Process file data (no lock needed)
        const char *data;
        unsigned long size;
        gp_file_get_data_and_size(file, &data, &size);

        NSData *imageData = [NSData dataWithBytes:data length:size];
        // Save to disk, notify delegate, etc.
    }

    gp_file_free(file);
}
```

### 4. Download Queue Configuration

```objc
- (instancetype)init {
    self = [super init];
    if (self) {
        _cameraLock = [[NSLock alloc] init];

        // Create download queue with max 3 concurrent operations
        _downloadQueue = [[NSOperationQueue alloc] init];
        _downloadQueue.maxConcurrentOperationCount = 3;
        _downloadQueue.qualityOfService = NSQualityOfServiceUserInitiated;

        // ... rest of init ...
    }
    return self;
}
```

## Benefits

### 1. Non-Blocking Event Detection

**Current (Sequential):**

- Event monitoring pauses during 2-second download
- If photographer takes 3 photos in 5 seconds:
  - Photo 1: Detected at 0s, downloaded by 2s
  - Photo 2: Detected at 2s, downloaded by 4s
  - Photo 3: Detected at 4s, downloaded by 6s
  - **Total time: 6 seconds**

**Proposed (Concurrent):**

- Event monitoring polls every 100ms regardless of downloads
- If photographer takes 3 photos in 5 seconds:
  - Photo 1: Detected at 0s, downloading in background
  - Photo 2: Detected at 0.1s, downloading concurrently
  - Photo 3: Detected at 0.2s, downloading concurrently
  - All complete by ~2 seconds (parallel downloads)
  - **Total time: 2 seconds** ✅

### 2. Better Burst Shooting Support

**Scenario:** Photographer shoots 10 photos rapidly (action sequence)

**Current:**

- Photos detected/downloaded one at a time
- 10 photos × 2 seconds = **20 seconds total**
- Last photo appears 20 seconds after shutter

**Proposed:**

- All 10 photos detected within 1 second
- 3-4 download in parallel at any time
- 10 photos ÷ 3 threads × 2 seconds = **~7 seconds total**
- Last photo appears 7 seconds after shutter ✅

### 3. More Responsive UI

- "Detected" counter updates immediately (100ms latency)
- Downloads happen in background without blocking detection
- UI shows real-time progress

## Challenges & Risks

### 1. Mutex Deadlock Risk

**Potential Issue:**

```objc
Thread 1: Lock → Wait for event → [BLOCKED] → ...
Thread 2: [Waiting for lock] → Lock → Download → Unlock
```

**Mitigation:**

- Always use `timeout=0` for event polling (non-blocking)
- Lock is held for microseconds, not seconds
- No nested locks (single mutex only)

### 2. Camera Overload

**Issue:** 3 concurrent downloads might overwhelm camera

**Symptoms:**

- Camera becomes unresponsive
- Downloads fail with timeout errors
- WiFi connection drops

**Mitigation:**

- Start with `maxConcurrentOperationCount = 1` (same as sequential)
- Gradually increase to 2, then 3
- Monitor for errors and adjust

### 3. PTP Protocol Limitations

**Remember:** PTP command channel is inherently sequential

**Reality Check:**

- Even with 3 threads, only 1 can talk to camera at a time
- Mutex serializes access anyway
- **Benefit is non-blocking event detection**, not truly parallel downloads

**Actual gain:**

- Event monitoring doesn't pause ✅
- Downloads still happen one at a time (protocol limitation)
- But queue processes faster because monitoring continues

### 4. Complexity

**Sequential (Current):**

- ~150 lines of code
- Easy to understand
- Easy to debug
- No race conditions

**Concurrent (Proposed):**

- ~250 lines of code
- More complex logic
- Harder to debug (threading issues)
- Potential race conditions

**Question:** Is the complexity worth the gain?

## When to Implement This

### Triggers for Optimization

Implement concurrent approach if **any** of these occur:

1. **Photographers complain about slow detection**
   - "I took 5 photos but app only shows 1"
   - "Photos don't appear until I stop shooting"

2. **Burst shooting is common use case**
   - Sports photography
   - Action sequences
   - Event coverage with rapid shooting

3. **Download times are consistently long**
   - Weak WiFi signal (5+ seconds per photo)
   - Large file sizes (RAW+JPEG)
   - Multiple photographers on same network

4. **UI feels sluggish during downloads**
   - Detection counter lags
   - App freezes briefly

### Don't Implement If:

1. ✅ Sequential works well (downloads complete in 1-2 seconds)
2. ✅ Photographers shoot slowly (1 photo per 30 seconds)
3. ✅ MVP needs to ship quickly
4. ✅ Event photography typical rate: 1-3 photos per minute

**For MVP: Sequential is sufficient.** Revisit after real-world usage.

## Implementation Estimate

**If we decide to implement:**

### Phase 1: Add Mutex Locking (2 hours)

- Add NSLock to WiFiCameraManager
- Wrap all camera operations with lock/unlock
- Test for deadlocks
- Verify no regressions

### Phase 2: Non-Blocking Event Loop (1 hour)

- Change `gp_camera_wait_for_event()` to timeout=0
- Add sleep delay in loop
- Test detection still works
- Measure CPU usage

### Phase 3: Concurrent Download Queue (2 hours)

- Create NSOperationQueue
- Move downloads to queue
- Set maxConcurrentOperationCount = 1 initially
- Test thoroughly

### Phase 4: Tuning & Testing (2 hours)

- Gradually increase concurrent limit
- Test with burst shooting (10+ photos)
- Monitor for camera errors
- Performance profiling

### Phase 5: Edge Case Handling (1 hour)

- Camera disconnect during download
- Queue cancellation on disconnect
- Memory management
- Error recovery

**Total: 8 hours**

**Risk:** Medium (threading bugs are hard to debug)

## Alternative: Keep Sequential, Optimize Download Speed

**Instead of concurrent threads, optimize the download itself:**

### Option A: Download Thumbnails First

```objc
// Quick preview (100-200KB, 200ms)
ret = gp_camera_file_get(_camera, folder, name, GP_FILE_TYPE_PREVIEW, file, _context);
// Show thumbnail in UI immediately

// Full download in background (3-5MB, 2000ms)
ret = gp_camera_file_get(_camera, folder, name, GP_FILE_TYPE_NORMAL, file, _context);
// Replace thumbnail with full image
```

**Benefits:**

- Instant preview (200ms vs 2000ms)
- User sees photos immediately
- Full download happens in background
- Simpler than threading

**Estimated effort:** 3 hours

### Option B: Optimize Network Settings

```objc
// Set larger TCP buffer sizes
setsockopt(socket, SOL_SOCKET, SO_RCVBUF, &bufsize, sizeof(bufsize));

// Disable Nagle's algorithm for faster small transfers
int flag = 1;
setsockopt(socket, IPPROTO_TCP, TCP_NODELAY, &flag, sizeof(flag));
```

**Benefits:**

- Faster downloads (maybe 1.5s instead of 2s)
- No architecture changes
- Lower risk

**Estimated effort:** 1 hour

## Recommendation

### For MVP: Stick with Sequential

**Reasons:**

1. ✅ Simple, proven, reliable
2. ✅ Fast enough for typical event photography
3. ✅ Low complexity = easier to maintain
4. ✅ Focus on shipping product

### Post-MVP: Monitor Real-World Usage

**Collect data:**

- Average photos per session
- Shooting rate (photos/minute)
- User complaints about responsiveness
- Download times in production

**Then decide:**

- If users happy → Keep sequential ✅
- If burst shooting common → Implement thumbnail preview first
- If still issues → Implement concurrent threading

## Testing Plan (If We Implement)

### Unit Tests

- [ ] Mutex lock/unlock correctness
- [ ] No deadlocks under stress
- [ ] Queue processes items correctly
- [ ] Memory leaks checked

### Integration Tests

- [ ] Single photo download
- [ ] Burst shooting (10 photos)
- [ ] Download while monitoring
- [ ] Camera disconnect handling

### Performance Tests

- [ ] CPU usage (should be < 10%)
- [ ] Memory usage (should be stable)
- [ ] Download throughput (measure improvement)
- [ ] Event detection latency (should be < 100ms)

### Stress Tests

- [ ] 50 photos rapid succession
- [ ] Weak WiFi signal
- [ ] Camera power off/on during operation
- [ ] Multiple connect/disconnect cycles

## References

### libgphoto2 Threading Examples

- [python-gphoto2 threading example](https://github.com/jim-easterbrook/python-gphoto2/blob/master/examples/camera-threading.py)
- [libgphoto2 issue #1038 - Using mutex for concurrent access](https://github.com/gphoto/libgphoto2/issues/1038#issuecomment-666198991)

### PTP Protocol Documentation

- [ISO 15740:2013 - PTP/IP specification](https://www.iso.org/standard/54126.html)
- Command channel is inherently sequential
- Event channel can run concurrently

### iOS Threading Best Practices

- [Apple: Threading Programming Guide](https://developer.apple.com/library/archive/documentation/Cocoa/Conceptual/Multithreading/Introduction/Introduction.html)
- [NSOperationQueue documentation](https://developer.apple.com/documentation/foundation/nsoperationqueue)
- Quality of Service levels

## Related Documents

- `log/004-gphoto2-concurrent-download-fix.md` - Current sequential implementation plan
- `ios/MVP_PLAN.md` - Phase 4 download requirements
- `.claude/tech-image/index.md` - Architecture decisions

---

**Summary:** This is a valid optimization idea with real benefits for burst shooting scenarios. However, for MVP, sequential downloads are simpler and sufficient. Revisit this after real-world usage data shows it's needed.

**Decision:** Defer to post-MVP. Focus on shipping with sequential approach first.
