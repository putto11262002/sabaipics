//
//  WiFiCameraManager.m
//  SabaiPicsStudio
//
//  Created: 2026-01-14
//  Objective-C implementation of GPhoto2 WiFi camera bridge
//
//  Phase 1: Skeleton implementation - connection methods are stubs
//  Phase 2: Will implement full GPhoto2 connection and event monitoring logic
//

#import "WiFiCameraManager.h"
#import <GPhoto2/gphoto2.h>

#pragma mark - Error Domain

// Error domain for WiFiCameraManager errors
static NSString * const WiFiCameraManagerErrorDomain = @"com.sabaipics.wificameramanager";

// Error codes
typedef NS_ENUM(NSInteger, WiFiCameraManagerErrorCode) {
    WiFiCameraManagerErrorConnectionFailed = 1000,
    WiFiCameraManagerErrorNotConnected = 1001,
    WiFiCameraManagerErrorCameraInitFailed = 1002,
    WiFiCameraManagerErrorDownloadFailed = 1003,
    WiFiCameraManagerErrorInvalidParameter = 1004,
};

#pragma mark - Private Interface

@interface WiFiCameraManager ()

// GPhoto2 camera and context
@property (nonatomic, assign) Camera *camera;
@property (nonatomic, assign) GPContext *context;

// Connection state (read-write internally)
@property (nonatomic, assign, readwrite) WiFiCameraConnectionState connectionState;

// Camera info (read-write internally)
@property (nonatomic, strong, readwrite, nullable) NSString *cameraIP;
@property (nonatomic, strong, readwrite, nullable) NSString *cameraModel;
@property (nonatomic, strong, nullable) NSString *protocol;

// Event monitoring
@property (nonatomic, assign) BOOL isMonitoring;
@property (nonatomic, strong, nullable) NSThread *monitoringThread;

@end

#pragma mark - GPhoto2 Context Callbacks

/**
 * GPhoto2 error callback function
 * Called when GPhoto2 encounters an error
 */
static void ctx_error_func(GPContext *context, const char *str, void *data) {
    fprintf(stderr, "\n*** GPhoto2 Context Error ***\n%s\n", str);
    fflush(stderr);
    NSLog(@"[GPhoto2] Error: %s", str);
}

/**
 * GPhoto2 status callback function
 * Called for GPhoto2 status messages
 */
static void ctx_status_func(GPContext *context, const char *str, void *data) {
    fprintf(stderr, "[GPhoto2] Status: %s\n", str);
    fflush(stderr);
}

/**
 * Create GPhoto2 context with error and status callbacks
 */
static GPContext* createGPhoto2Context(void) {
    GPContext *context = gp_context_new();
    gp_context_set_error_func(context, ctx_error_func, NULL);
    gp_context_set_status_func(context, ctx_status_func, NULL);
    return context;
}

#pragma mark - WiFiCameraManager Implementation

@implementation WiFiCameraManager

#pragma mark - Lifecycle

/**
 * Initialize WiFiCameraManager
 * Sets up GPhoto2 context and initial state
 */
- (instancetype)init {
    self = [super init];
    if (self) {
        // Create GPhoto2 context
        _context = createGPhoto2Context();

        // Initialize state
        _connectionState = WiFiCameraConnectionStateDisconnected;
        _camera = NULL;
        _isMonitoring = NO;
        _monitoringThread = nil;

        NSLog(@"[WiFiCameraManager] Initialized");
    }
    return self;
}

/**
 * Cleanup on deallocation
 * Ensures camera is disconnected and context is freed
 */
- (void)dealloc {
    NSLog(@"[WiFiCameraManager] Deallocating...");

    // Stop monitoring if active
    if (_isMonitoring) {
        [self stopEventMonitoring];
    }

    // Disconnect camera if connected
    if (_camera != NULL) {
        gp_camera_exit(_camera, _context);
        gp_camera_free(_camera);
        _camera = NULL;
    }

    // Free context
    if (_context != NULL) {
        gp_context_unref(_context);
        _context = NULL;
    }

    NSLog(@"[WiFiCameraManager] Deallocated");
}

#pragma mark - Connection Methods

/**
 * Connect to WiFi camera
 * Phase 1: SKELETON IMPLEMENTATION - will be completed in Phase 2
 */
- (BOOL)connectWithIP:(NSString *)ip
                model:(NSString *)model
             protocol:(NSString *)protocol
                error:(NSError **)error {

    NSLog(@"[WiFiCameraManager] connectWithIP called (Phase 1 skeleton)");
    NSLog(@"  IP: %@", ip);
    NSLog(@"  Model: %@", model);
    NSLog(@"  Protocol: %@", protocol);

    // Validate parameters
    if (!ip || ip.length == 0) {
        [self setError:error
               message:@"IP address is required"
                  code:WiFiCameraManagerErrorInvalidParameter];
        return NO;
    }

    if (!model || model.length == 0) {
        [self setError:error
               message:@"Camera model is required"
                  code:WiFiCameraManagerErrorInvalidParameter];
        return NO;
    }

    if (!protocol || protocol.length == 0) {
        [self setError:error
               message:@"Protocol is required"
                  code:WiFiCameraManagerErrorInvalidParameter];
        return NO;
    }

    // Store connection info
    self.cameraIP = ip;
    self.cameraModel = model;
    self.protocol = protocol;

    // Update state
    self.connectionState = WiFiCameraConnectionStateConnecting;

    // Phase 1: Return NO to indicate not yet implemented
    // Phase 2: Will implement full GPhoto2 connection logic here
    // - gp_abilities_list_lookup_model() to find camera
    // - gp_port_info_list_lookup_path() to setup ptpip port
    // - gp_camera_init() to connect
    // - Parse device info and store camera handle

    NSLog(@"[WiFiCameraManager] Phase 1: Connection logic not yet implemented");

    [self setError:error
           message:@"Connection not yet implemented in Phase 1"
              code:WiFiCameraManagerErrorConnectionFailed];

    self.connectionState = WiFiCameraConnectionStateDisconnected;

    return NO;
}

/**
 * Disconnect from camera
 * Phase 1: SKELETON IMPLEMENTATION - will be completed in Phase 2
 */
- (void)disconnect {
    NSLog(@"[WiFiCameraManager] disconnect called (Phase 1 skeleton)");

    // Stop monitoring if active
    if (self.isMonitoring) {
        [self stopEventMonitoring];
    }

    // Phase 2: Will implement full disconnect logic here
    // - gp_camera_exit()
    // - gp_camera_free()
    // - Clean up camera handle

    // Update state
    self.connectionState = WiFiCameraConnectionStateDisconnected;
    self.cameraIP = nil;
    self.cameraModel = nil;
    self.protocol = nil;

    NSLog(@"[WiFiCameraManager] Disconnected");
}

#pragma mark - Event Monitoring Methods

/**
 * Start event monitoring
 * Phase 1: SKELETON IMPLEMENTATION - will be completed in Phase 3
 */
- (BOOL)startEventMonitoring {
    NSLog(@"[WiFiCameraManager] startEventMonitoring called (Phase 1 skeleton)");

    if (self.connectionState != WiFiCameraConnectionStateConnected) {
        NSLog(@"[WiFiCameraManager] Cannot start monitoring - not connected");
        return NO;
    }

    if (self.isMonitoring) {
        NSLog(@"[WiFiCameraManager] Already monitoring");
        return YES;
    }

    // Phase 3: Will implement event monitoring here
    // - Create background NSThread
    // - Run gp_camera_wait_for_event() loop
    // - Detect GP_EVENT_FILE_ADDED
    // - Call delegate didDetectNewPhoto

    self.isMonitoring = YES;
    NSLog(@"[WiFiCameraManager] Phase 1: Event monitoring not yet implemented");

    return NO;
}

/**
 * Stop event monitoring
 * Phase 1: SKELETON IMPLEMENTATION - will be completed in Phase 3
 */
- (void)stopEventMonitoring {
    NSLog(@"[WiFiCameraManager] stopEventMonitoring called (Phase 1 skeleton)");

    if (!self.isMonitoring) {
        NSLog(@"[WiFiCameraManager] Not currently monitoring");
        return;
    }

    // Phase 3: Will implement stop logic here
    // - Signal monitoring thread to stop
    // - Wait for thread to finish
    // - Clean up monitoring thread

    self.isMonitoring = NO;
    self.monitoringThread = nil;

    NSLog(@"[WiFiCameraManager] Monitoring stopped");
}

#pragma mark - Photo Download Methods

/**
 * Download photo from camera
 * Phase 1: SKELETON IMPLEMENTATION - will be completed in Phase 4
 */
- (void)downloadPhotoAtPath:(NSString *)path
                   filename:(NSString *)filename
                 completion:(void (^)(NSData * _Nullable, NSError * _Nullable))completion {

    NSLog(@"[WiFiCameraManager] downloadPhotoAtPath called (Phase 1 skeleton)");
    NSLog(@"  Path: %@", path);
    NSLog(@"  Filename: %@", filename);

    if (self.connectionState != WiFiCameraConnectionStateConnected) {
        NSLog(@"[WiFiCameraManager] Cannot download - not connected");
        NSError *error = [NSError errorWithDomain:WiFiCameraManagerErrorDomain
                                             code:WiFiCameraManagerErrorNotConnected
                                         userInfo:@{NSLocalizedDescriptionKey: @"Camera not connected"}];
        if (completion) {
            completion(nil, error);
        }
        return;
    }

    // Phase 4: Will implement download logic here
    // - Run on background queue
    // - Use gp_camera_file_get() or gp_camera_file_read()
    // - Return NSData on completion
    // - Handle errors

    NSLog(@"[WiFiCameraManager] Phase 1: Download not yet implemented");

    NSError *error = [NSError errorWithDomain:WiFiCameraManagerErrorDomain
                                         code:WiFiCameraManagerErrorDownloadFailed
                                     userInfo:@{NSLocalizedDescriptionKey: @"Download not yet implemented in Phase 1"}];

    if (completion) {
        dispatch_async(dispatch_get_main_queue(), ^{
            completion(nil, error);
        });
    }
}

#pragma mark - Helper Methods

/**
 * Helper method to set NSError pointer with message and code
 */
- (void)setError:(NSError **)error message:(NSString *)message code:(NSInteger)code {
    if (error != NULL) {
        *error = [NSError errorWithDomain:WiFiCameraManagerErrorDomain
                                     code:code
                                 userInfo:@{NSLocalizedDescriptionKey: message}];
    }
    NSLog(@"[WiFiCameraManager] Error: %@ (code: %ld)", message, (long)code);
}

@end
