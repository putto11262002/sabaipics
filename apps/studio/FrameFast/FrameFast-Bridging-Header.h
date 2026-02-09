//
//  FrameFast-Bridging-Header.h
//  FrameFast
//
//  Created: 2026-01-14
//  Bridging header to expose GPhoto2 C library to Swift
//
//  This header allows Swift code to access GPhoto2 functions through
//  the WiFiCameraManager Objective-C bridge.
//

#ifndef FrameFast_Bridging_Header_h
#define FrameFast_Bridging_Header_h

// Import the main GPhoto2 header
// This provides access to all libgphoto2 camera control functions
#import <GPhoto2/gphoto2.h>

// Import the WiFiCameraManager Objective-C bridge
// This exposes the WiFiCameraManager class and delegate protocol to Swift
#import "WiFiCameraManager.h"

#endif /* FrameFast_Bridging_Header_h */
