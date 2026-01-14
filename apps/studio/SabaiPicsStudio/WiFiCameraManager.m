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

// Note: PTP headers not available in public framework headers
// Device info logging is optional and commented out for now

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
 * Phase 2: FULL IMPLEMENTATION with GPhoto2
 */
- (BOOL)connectWithIP:(NSString *)ip
                model:(NSString *)model
             protocol:(NSString *)protocol
                error:(NSError **)error {

    NSLog(@"[WiFiCameraManager] === Starting Camera Connection ===");
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

    // PHASE 2: Full GPhoto2 connection implementation
    int ret;
    CameraAbilitiesList *abilities = NULL;
    CameraAbilities a;
    GPPortInfoList *portinfolist = NULL;
    GPPortInfo pi;

    // Build connection string (e.g. "ptpip:192.168.1.1")
    NSString *connectionStr = [NSString stringWithFormat:@"%@:%@", protocol, ip];
    NSLog(@"[WiFiCameraManager] Connection string: %@", connectionStr);

    // Step 1: Create new camera instance
    ret = gp_camera_new(&_camera);
    if (ret != GP_OK) {
        NSLog(@"[WiFiCameraManager] ERROR: Failed to create camera instance (code: %d)", ret);
        [self setError:error
               message:@"Failed to create camera instance"
                  code:WiFiCameraManagerErrorCameraInitFailed];
        self.connectionState = WiFiCameraConnectionStateError;
        return NO;
    }

    // Step 2: Load camera abilities list
    NSLog(@"[WiFiCameraManager] Looking up camera abilities for: %@", model);
    ret = gp_abilities_list_new(&abilities);
    if (ret != GP_OK) {
        NSLog(@"[WiFiCameraManager] ERROR: Failed to create abilities list (code: %d)", ret);
        [self setError:error
               message:@"Failed to initialize camera abilities"
                  code:WiFiCameraManagerErrorCameraInitFailed];
        gp_camera_free(_camera);
        _camera = NULL;
        self.connectionState = WiFiCameraConnectionStateError;
        return NO;
    }

    ret = gp_abilities_list_load(abilities, _context);
    if (ret != GP_OK) {
        NSLog(@"[WiFiCameraManager] ERROR: Failed to load abilities list (code: %d)", ret);
        [self setError:error
               message:@"Failed to load camera abilities"
                  code:WiFiCameraManagerErrorCameraInitFailed];
        gp_abilities_list_free(abilities);
        gp_camera_free(_camera);
        _camera = NULL;
        self.connectionState = WiFiCameraConnectionStateError;
        return NO;
    }

    // Step 3: Look up camera model in abilities list
    int modelIndex = gp_abilities_list_lookup_model(abilities, [model UTF8String]);
    if (modelIndex < 0) {
        NSLog(@"[WiFiCameraManager] ERROR: Camera model not found in abilities list");
        NSString *errorMsg = [NSString stringWithFormat:@"Camera not found at %@", ip];
        [self setError:error
               message:errorMsg
                  code:WiFiCameraManagerErrorConnectionFailed];
        gp_abilities_list_free(abilities);
        gp_camera_free(_camera);
        _camera = NULL;
        self.connectionState = WiFiCameraConnectionStateError;
        return NO;
    }

    NSLog(@"[WiFiCameraManager] Found camera model at index: %d", modelIndex);
    ret = gp_abilities_list_get_abilities(abilities, modelIndex, &a);
    if (ret != GP_OK) {
        NSLog(@"[WiFiCameraManager] ERROR: Failed to get camera abilities (code: %d)", ret);
        [self setError:error
               message:@"Failed to get camera abilities"
                  code:WiFiCameraManagerErrorCameraInitFailed];
        gp_abilities_list_free(abilities);
        gp_camera_free(_camera);
        _camera = NULL;
        self.connectionState = WiFiCameraConnectionStateError;
        return NO;
    }

    ret = gp_camera_set_abilities(_camera, a);
    if (ret != GP_OK) {
        NSLog(@"[WiFiCameraManager] ERROR: Failed to set camera abilities (code: %d)", ret);
        [self setError:error
               message:@"Failed to configure camera abilities"
                  code:WiFiCameraManagerErrorCameraInitFailed];
        gp_abilities_list_free(abilities);
        gp_camera_free(_camera);
        _camera = NULL;
        self.connectionState = WiFiCameraConnectionStateError;
        return NO;
    }

    gp_abilities_list_free(abilities);

    // Step 4: Set up port info for WiFi connection
    NSLog(@"[WiFiCameraManager] Setting up port info for: %@", connectionStr);
    ret = gp_port_info_list_new(&portinfolist);
    if (ret != GP_OK) {
        NSLog(@"[WiFiCameraManager] ERROR: Failed to create port info list (code: %d)", ret);
        [self setError:error
               message:@"Failed to initialize port info"
                  code:WiFiCameraManagerErrorCameraInitFailed];
        gp_camera_free(_camera);
        _camera = NULL;
        self.connectionState = WiFiCameraConnectionStateError;
        return NO;
    }

    ret = gp_port_info_list_load(portinfolist);
    if (ret != GP_OK) {
        NSLog(@"[WiFiCameraManager] ERROR: Failed to load port info list (code: %d)", ret);
        [self setError:error
               message:@"Failed to load port info"
                  code:WiFiCameraManagerErrorCameraInitFailed];
        gp_port_info_list_free(portinfolist);
        gp_camera_free(_camera);
        _camera = NULL;
        self.connectionState = WiFiCameraConnectionStateError;
        return NO;
    }

    int portCount = gp_port_info_list_count(portinfolist);
    NSLog(@"[WiFiCameraManager] Found %d ports in port info list", portCount);

    // Step 5: Look up port path (e.g. "ptpip:192.168.1.1")
    int portIndex = gp_port_info_list_lookup_path(portinfolist, [connectionStr UTF8String]);
    if (portIndex < 0) {
        NSLog(@"[WiFiCameraManager] ERROR: Port not found in port info list");
        [self setError:error
               message:@"Camera not responding - check WiFi"
                  code:WiFiCameraManagerErrorConnectionFailed];
        gp_port_info_list_free(portinfolist);
        gp_camera_free(_camera);
        _camera = NULL;
        self.connectionState = WiFiCameraConnectionStateError;
        return NO;
    }

    NSLog(@"[WiFiCameraManager] Found port at index: %d", portIndex);
    ret = gp_port_info_list_get_info(portinfolist, portIndex, &pi);
    if (ret != GP_OK) {
        NSLog(@"[WiFiCameraManager] ERROR: Failed to get port info (code: %d)", ret);
        [self setError:error
               message:@"Failed to get port information"
                  code:WiFiCameraManagerErrorCameraInitFailed];
        gp_port_info_list_free(portinfolist);
        gp_camera_free(_camera);
        _camera = NULL;
        self.connectionState = WiFiCameraConnectionStateError;
        return NO;
    }

    ret = gp_camera_set_port_info(_camera, pi);
    if (ret != GP_OK) {
        NSLog(@"[WiFiCameraManager] ERROR: Failed to set port info (code: %d)", ret);
        [self setError:error
               message:@"Failed to configure camera port"
                  code:WiFiCameraManagerErrorCameraInitFailed];
        gp_port_info_list_free(portinfolist);
        gp_camera_free(_camera);
        _camera = NULL;
        self.connectionState = WiFiCameraConnectionStateError;
        return NO;
    }

    gp_port_info_list_free(portinfolist);

    // Step 6: Configure ptpip settings (optional, for better compatibility)
    NSLog(@"[WiFiCameraManager] Configuring ptpip settings...");
    gp_setting_set("ptpip", "hostname", "sabaipics-studio");

    // Step 7: Initialize camera (actually connect!)
    NSLog(@"[WiFiCameraManager] Initializing camera connection...");
    ret = gp_camera_init(_camera, _context);

    if (ret == GP_OK) {
        // SUCCESS!
        NSLog(@"[WiFiCameraManager] ✅ Camera initialized successfully!");

        // Device info logging (requires PTP headers - commented out for now)
        // Phase 3: Can add back if needed with proper header path
        /*
        PTPParams *params = &(_camera->pl->params);
        if (params->deviceinfo.Model) {
            NSLog(@"[WiFiCameraManager] Connected to: %s", params->deviceinfo.Model);
        }
        if (params->deviceinfo.Manufacturer) {
            NSLog(@"[WiFiCameraManager] Manufacturer: %s", params->deviceinfo.Manufacturer);
        }
        if (params->deviceinfo.SerialNumber) {
            NSLog(@"[WiFiCameraManager] Serial Number: %s", params->deviceinfo.SerialNumber);
        }
        */

        self.connectionState = WiFiCameraConnectionStateConnected;

        // Notify delegate on main thread
        if (self.delegate && [self.delegate respondsToSelector:@selector(cameraManagerDidConnect:)]) {
            dispatch_async(dispatch_get_main_queue(), ^{
                [self.delegate cameraManagerDidConnect:self];
            });
        }

        NSLog(@"[WiFiCameraManager] === Connection Successful ===");
        return YES;

    } else {
        // FAILURE
        NSLog(@"[WiFiCameraManager] ❌ Camera initialization failed with code: %d", ret);

        NSString *errorMsg;
        if (ret == GP_ERROR_IO || ret == GP_ERROR_TIMEOUT) {
            errorMsg = @"Connection timeout - check WiFi";
        } else if (ret == GP_ERROR_MODEL_NOT_FOUND) {
            errorMsg = [NSString stringWithFormat:@"Camera not found at %@", ip];
        } else {
            errorMsg = [NSString stringWithFormat:@"Connection failed (error code: %d)", ret];
        }

        NSError *nsError = [NSError errorWithDomain:WiFiCameraManagerErrorDomain
                                               code:WiFiCameraManagerErrorConnectionFailed
                                           userInfo:@{NSLocalizedDescriptionKey: errorMsg}];

        if (error != NULL) {
            *error = nsError;
        }

        // Notify delegate on main thread
        if (self.delegate && [self.delegate respondsToSelector:@selector(cameraManager:didFailWithError:)]) {
            dispatch_async(dispatch_get_main_queue(), ^{
                [self.delegate cameraManager:self didFailWithError:nsError];
            });
        }

        // Clean up
        gp_camera_free(_camera);
        _camera = NULL;
        self.connectionState = WiFiCameraConnectionStateError;

        NSLog(@"[WiFiCameraManager] === Connection Failed ===");
        return NO;
    }
}

/**
 * Disconnect from camera
 * Phase 2: FULL IMPLEMENTATION
 */
- (void)disconnect {
    NSLog(@"[WiFiCameraManager] === Disconnecting from camera ===");

    // Stop monitoring if active
    if (self.isMonitoring) {
        [self stopEventMonitoring];
    }

    // Disconnect and free camera
    if (_camera != NULL) {
        NSLog(@"[WiFiCameraManager] Closing camera connection...");
        gp_camera_exit(_camera, _context);
        gp_camera_free(_camera);
        _camera = NULL;
        NSLog(@"[WiFiCameraManager] Camera freed");
    }

    // Update state
    self.connectionState = WiFiCameraConnectionStateDisconnected;
    self.cameraIP = nil;
    self.cameraModel = nil;
    self.protocol = nil;

    NSLog(@"[WiFiCameraManager] === Disconnected ===");
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
