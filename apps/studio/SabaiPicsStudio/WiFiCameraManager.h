//
//  WiFiCameraManager.h
//  SabaiPicsStudio
//
//  Created: 2026-01-14
//  Objective-C bridge for GPhoto2 WiFi camera functionality
//
//  This manager provides a clean interface for Swift to interact with
//  GPhoto2's C library for WiFi camera control and photo download.
//

#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

#pragma mark - Connection State

/**
 * Connection state of the WiFi camera
 */
typedef NS_ENUM(NSInteger, WiFiCameraConnectionState) {
    WiFiCameraConnectionStateDisconnected = 0,  // Not connected
    WiFiCameraConnectionStateConnecting = 1,    // Connection in progress
    WiFiCameraConnectionStateConnected = 2,     // Successfully connected
    WiFiCameraConnectionStateError = 3          // Connection error
};

#pragma mark - Delegate Protocol

@protocol WiFiCameraManagerDelegate;

/**
 * Delegate protocol for WiFi camera events
 * Implement this protocol to receive camera connection status, photo detection, and download updates
 */
@protocol WiFiCameraManagerDelegate <NSObject>

@optional

/**
 * Called when camera successfully connects
 */
- (void)cameraManagerDidConnect:(id)manager;

/**
 * Called when camera connection or operation fails
 * @param manager The camera manager instance
 * @param error The error that occurred
 */
- (void)cameraManager:(id)manager didFailWithError:(NSError *)error;

/**
 * Called when a new photo is detected on the camera
 * @param manager The camera manager instance
 * @param filename Name of the photo file (e.g. "IMG_1234.JPG")
 * @param folder Folder path on camera (e.g. "/store_10000001")
 */
- (void)cameraManager:(id)manager didDetectNewPhoto:(NSString *)filename folder:(NSString *)folder;

/**
 * Called when photo download completes
 * @param manager The camera manager instance
 * @param photoData The downloaded JPEG photo data
 * @param filename Name of the downloaded file
 */
- (void)cameraManager:(id)manager didDownloadPhoto:(NSData *)photoData filename:(NSString *)filename;

@end

#pragma mark - WiFiCameraManager Interface

/**
 * WiFiCameraManager - Objective-C bridge to GPhoto2 for Canon WiFi cameras
 *
 * Responsibilities:
 * - Connect to Canon cameras via WiFi (ptpip protocol)
 * - Monitor for new photo events (GP_EVENT_FILE_ADDED)
 * - Download photos from camera to app
 * - Manage connection lifecycle
 *
 * Usage:
 * 1. Create instance: manager = [[WiFiCameraManager alloc] init]
 * 2. Set delegate: manager.delegate = self
 * 3. Connect: [manager connectWithIP:@"192.168.1.1" model:@"Canon EOS (WLAN)" protocol:@"ptpip" error:&error]
 * 4. Start monitoring: [manager startEventMonitoring]
 * 5. Download photos via delegate callbacks
 * 6. Disconnect: [manager disconnect]
 */
@interface WiFiCameraManager : NSObject

#pragma mark - Properties

/**
 * Delegate to receive camera events and updates
 */
@property (nonatomic, weak, nullable) id<WiFiCameraManagerDelegate> delegate;

/**
 * Current connection state
 */
@property (nonatomic, assign, readonly) WiFiCameraConnectionState connectionState;

/**
 * IP address of connected camera (e.g. "192.168.1.1")
 */
@property (nonatomic, strong, readonly, nullable) NSString *cameraIP;

/**
 * Camera model string (e.g. "Canon EOS (WLAN)")
 */
@property (nonatomic, strong, readonly, nullable) NSString *cameraModel;

#pragma mark - Connection Methods

/**
 * Connect to WiFi camera
 *
 * @param ip IP address of camera (typically "192.168.1.1" for Canon WiFi)
 * @param model Camera model string that matches GPhoto2 abilities list (e.g. "Canon EOS (WLAN)")
 * @param protocol Protocol to use (typically "ptpip" for Canon WiFi)
 * @param error Output parameter for error details if connection fails
 * @return YES if connection successful, NO if failed (check error for details)
 *
 * Example:
 * ```objc
 * NSError *error = nil;
 * BOOL success = [manager connectWithIP:@"192.168.1.1"
 *                                  model:@"Canon EOS (WLAN)"
 *                               protocol:@"ptpip"
 *                                  error:&error];
 * if (!success) {
 *     NSLog(@"Connection failed: %@", error.localizedDescription);
 * }
 * ```
 */
- (BOOL)connectWithIP:(NSString *)ip
                model:(NSString *)model
             protocol:(NSString *)protocol
                error:(NSError **)error;

/**
 * Disconnect from camera
 * Stops event monitoring if active and cleanly disconnects from camera
 */
- (void)disconnect;

#pragma mark - Event Monitoring Methods

/**
 * Start monitoring for camera events (new photos, etc.)
 * Creates a background thread that polls camera for GP_EVENT_FILE_ADDED events
 * Delegate will receive didDetectNewPhoto callbacks when photos are taken
 *
 * @return YES if monitoring started successfully, NO if failed
 */
- (BOOL)startEventMonitoring;

/**
 * Stop event monitoring
 * Stops the background monitoring thread
 */
- (void)stopEventMonitoring;

#pragma mark - Photo Download Methods

/**
 * Download a photo from the camera
 *
 * @param path Folder path on camera (from didDetectNewPhoto delegate method)
 * @param filename Filename on camera (from didDetectNewPhoto delegate method)
 * @param completion Completion block called with photo data or error
 *
 * Example:
 * ```objc
 * [manager downloadPhotoAtPath:@"/store_10000001"
 *                     filename:@"IMG_1234.JPG"
 *                   completion:^(NSData *data, NSError *error) {
 *     if (data) {
 *         UIImage *image = [UIImage imageWithData:data];
 *     } else {
 *         NSLog(@"Download failed: %@", error);
 *     }
 * }];
 * ```
 */
- (void)downloadPhotoAtPath:(NSString *)path
                   filename:(NSString *)filename
                 completion:(void (^)(NSData * _Nullable photoData, NSError * _Nullable error))completion;

@end

NS_ASSUME_NONNULL_END
