//
//  ViewController.h
//  GPhoto2Example
//
//  Created by Hendrik Holtmann on 21.10.18.
//  Copyright © 2019 Hendrik Holtmann. All rights reserved.
//
//  Modified for Canon EOS WiFi Testing
//  Target: Canon EOS cameras via WiFi (ptpip:192.168.1.1)
//
//  USAGE:
//  1. Connect Canon camera to WiFi network (camera creates WiFi network)
//  2. Join camera's WiFi network from iPad
//  3. Camera IP is usually 192.168.1.1 (pre-configured)
//  4. Tap "Connect to Canon" button
//  5. Once connected, tap "Start Event Monitor" to watch for new photos
//  6. Take photos on camera - app will detect and log them
//

#import <UIKit/UIKit.h>

@interface ViewController : UIViewController <UITextFieldDelegate>

// Main Actions
- (IBAction)connectTouchedPTP:(id)sender;
- (IBAction)connectLumixTouched:(id)sender;
- (IBAction)listTouched:(id)sender;
- (IBAction)downloadFile:(id)sender;
- (IBAction)startEventMonitoring:(id)sender;
- (IBAction)stopEventMonitoring:(id)sender;

// UI Outlets (Storyboard-connected)
@property (weak, nonatomic) IBOutlet UIButton *connectButtonPTP;
@property (weak, nonatomic) IBOutlet UIButton *connectButtonLumix;
@property (weak, nonatomic) IBOutlet UIButton *listButton;
@property (weak, nonatomic) IBOutlet UITextField *ipTextField;
@property (weak, nonatomic) IBOutlet UITextView *consoleTextView;

// UI Properties (Programmatically created)
@property (strong, nonatomic) UILabel *statusLabel;
@property (strong, nonatomic) UILabel *photoCountLabel;
@property (strong, nonatomic) UILabel *eventLogLabel;
@property (strong, nonatomic) UIButton *eventMonitorButton;
@property (strong, nonatomic) UIButton *stopMonitorButton;
@property (strong, nonatomic) UIProgressView *downloadProgressView;

// Event monitoring
@property (nonatomic, assign) BOOL isMonitoring;
@property (nonatomic, assign) int detectedPhotoCount;
@property (nonatomic, assign) int totalPhotosOnCamera;

@end
