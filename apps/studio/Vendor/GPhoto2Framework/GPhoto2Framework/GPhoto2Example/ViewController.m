//
//  ViewController.m
//  GPhoto2Example
//
//  Created by Hendrik Holtmann on 21.10.18.
//  Copyright © 2019 Hendrik Holtmann. All rights reserved.
//
//  Modified for Sony PTP/IP WiFi Testing
//  Target: Sony ILCE cameras via WiFi (ptpip:192.168.122.1)
//

#import "ViewController.h"
#import "ptp.h"
#import "ptp-private.h"
@import gphoto2;

#include <arpa/inet.h>
#include <errno.h>
#include <fcntl.h>
#include <netdb.h>
#include <netinet/in.h>
#include <sys/select.h>
#include <sys/socket.h>
#include <unistd.h>

static BOOL tcp_connect_with_timeout(const char *ip, int port, int timeoutMs) {
    if (!ip || port <= 0 || port > 65535 || timeoutMs <= 0) {
        return NO;
    }

    int fd = socket(AF_INET, SOCK_STREAM, 0);
    if (fd < 0) {
        return NO;
    }

    int flags = fcntl(fd, F_GETFL, 0);
    if (flags < 0 || fcntl(fd, F_SETFL, flags | O_NONBLOCK) < 0) {
        close(fd);
        return NO;
    }

    struct sockaddr_in addr;
    memset(&addr, 0, sizeof(addr));
    addr.sin_family = AF_INET;
    addr.sin_port = htons((uint16_t)port);
    if (inet_pton(AF_INET, ip, &addr.sin_addr) != 1) {
        close(fd);
        return NO;
    }

    int rc = connect(fd, (struct sockaddr *)&addr, sizeof(addr));
    if (rc == 0) {
        close(fd);
        return YES;
    }
    if (rc < 0 && errno != EINPROGRESS) {
        close(fd);
        return NO;
    }

    fd_set wfds;
    FD_ZERO(&wfds);
    FD_SET(fd, &wfds);

    struct timeval tv;
    tv.tv_sec = timeoutMs / 1000;
    tv.tv_usec = (timeoutMs % 1000) * 1000;

    rc = select(fd + 1, NULL, &wfds, NULL, &tv);
    if (rc <= 0) {
        close(fd);
        return NO;
    }

    int so_error = 0;
    socklen_t len = sizeof(so_error);
    if (getsockopt(fd, SOL_SOCKET, SO_ERROR, &so_error, &len) < 0) {
        close(fd);
        return NO;
    }

    close(fd);
    return so_error == 0;
}

// Sony PTP/IP WiFi Configuration Constants
// Use the generic PTP/IP camera model entry in libgphoto2.
#define CANON_WIFI_IP @"192.168.122.1"
#define CANON_CAMERA_MODEL @"PTP/IP Camera"
#define CANON_PROTOCOL @"ptpip"

@interface ViewController ()
{
    Camera        *camera;
    GPContext *context;
    dispatch_queue_t eventMonitorQueue;  // Background queue for event monitoring

    // Programmatic UI (bottom panel) to avoid overlapping storyboard controls.
    UIView *bottomPanel;
    BOOL customUISetup;
}
    @property(nonatomic, assign) BOOL connected;
    @property(nonatomic, assign) PTPDeviceInfo deviceInfo;
    @property(nonatomic, strong) NSString *cameraModel;
    @property(nonatomic, strong) NSString *protocol;
    @property(nonatomic, assign) BOOL fuji_browse_active;
    @property(nonatomic, strong) NSMutableArray *eventLog;  // Log of events for debugging
    @property(nonatomic, strong) NSMutableArray *detectedPhotosList;  // List of detected photos

@end


@implementation ViewController

#pragma mark - Lifecycle Methods

- (void)viewDidLoad {
    [super viewDidLoad];

    self.ipTextField.delegate = self;
    self.ipTextField.returnKeyType = UIReturnKeyDone;

    UITapGestureRecognizer *tap = [[UITapGestureRecognizer alloc] initWithTarget:self action:@selector(dismissKeyboard)];
    tap.cancelsTouchesInView = NO;
    [self.view addGestureRecognizer:tap];

    // Initialize event tracking
    self.eventLog = [NSMutableArray array];
    self.detectedPhotosList = [NSMutableArray array];
    self.detectedPhotoCount = 0;
    self.totalPhotosOnCamera = 0;
    self.isMonitoring = NO;

    // Pre-configure Sony PTP/IP WiFi settings
    self.ipTextField.text = CANON_WIFI_IP;
    self.protocol = CANON_PROTOCOL;
    self.cameraModel = CANON_CAMERA_MODEL;

    // Setup custom UI elements (positioned later in viewDidLayoutSubviews)
    [self setupCustomUI];

    // Log startup configuration
    NSLog(@"=== Sony PTP/IP WiFi Test App Started ===");
    NSLog(@"Camera IP: %@", CANON_WIFI_IP);
    NSLog(@"Camera Model: %@", CANON_CAMERA_MODEL);
    NSLog(@"Protocol: %@", CANON_PROTOCOL);
    NSLog(@"Connection String: %@:%@", CANON_PROTOCOL, CANON_WIFI_IP);
    NSLog(@"=====================================");

    // Update console with instructions
    self.consoleTextView.text = @"Sony PTP/IP WiFi Test App\n\n"
                                @"Instructions:\n"
                                @"1. Enable WiFi (Access Point) on your Sony camera\n"
                                @"2. Connect iPhone/iPad to the camera's DIRECT-xxxx WiFi\n"
                                @"3. Tap 'Connect' (PTP/IP)\n"
                                @"4. Once connected, tap 'Start Event Monitor'\n"
                                @"5. Take photos - events/download will appear in logs\n\n"
                                @"Ready to connect...";
}

- (void)dismissKeyboard {
    [self.view endEditing:YES];
}

- (BOOL)textFieldShouldReturn:(UITextField *)textField {
    [textField resignFirstResponder];
    return YES;
}

- (void)viewDidLayoutSubviews {
    [super viewDidLayoutSubviews];
    [self layoutCustomUI];
}

#pragma mark - UI Setup

/**
 * Sets up custom UI elements for Canon WiFi testing
 * Creates status labels, photo counter, event log, and control buttons
 */
- (void)setupCustomUI {
    if (customUISetup) {
        return;
    }
    customUISetup = YES;

    // Bottom panel container (keeps our controls away from storyboard buttons)
    bottomPanel = [[UIView alloc] initWithFrame:CGRectZero];
    bottomPanel.backgroundColor = [[UIColor colorWithWhite:1.0 alpha:0.92] colorWithAlphaComponent:0.92];
    bottomPanel.layer.cornerRadius = 12;
    bottomPanel.layer.masksToBounds = YES;
    [self.view addSubview:bottomPanel];

    // Status Label - shows connection state
    self.statusLabel = [[UILabel alloc] initWithFrame:CGRectZero];
    self.statusLabel.text = @"Status: Disconnected";
    self.statusLabel.textAlignment = NSTextAlignmentCenter;
    self.statusLabel.font = [UIFont boldSystemFontOfSize:16];
    self.statusLabel.textColor = [UIColor redColor];
    [bottomPanel addSubview:self.statusLabel];

    // Photo Count Label - shows number of photos detected
    self.photoCountLabel = [[UILabel alloc] initWithFrame:CGRectZero];
    self.photoCountLabel.text = @"Photos Detected: 0";
    self.photoCountLabel.textAlignment = NSTextAlignmentCenter;
    self.photoCountLabel.font = [UIFont systemFontOfSize:14];
    [bottomPanel addSubview:self.photoCountLabel];

    // Event Log Label - shows recent events
    self.eventLogLabel = [[UILabel alloc] initWithFrame:CGRectZero];
    self.eventLogLabel.text = @"Event Log:\n(waiting...)";
    self.eventLogLabel.numberOfLines = 0;
    self.eventLogLabel.textAlignment = NSTextAlignmentCenter;
    self.eventLogLabel.font = [UIFont systemFontOfSize:12];
    self.eventLogLabel.textColor = [UIColor darkGrayColor];
    [bottomPanel addSubview:self.eventLogLabel];

    // Event Monitor Button
    self.eventMonitorButton = [UIButton buttonWithType:UIButtonTypeSystem];
    [self.eventMonitorButton setTitle:@"Start Event Monitor" forState:UIControlStateNormal];
    self.eventMonitorButton.backgroundColor = [UIColor colorWithRed:0.0 green:0.5 blue:0.0 alpha:1.0];
    [self.eventMonitorButton setTitleColor:[UIColor whiteColor] forState:UIControlStateNormal];
    self.eventMonitorButton.layer.cornerRadius = 8;
    self.eventMonitorButton.enabled = NO;
    [self.eventMonitorButton addTarget:self action:@selector(startEventMonitoring:) forControlEvents:UIControlEventTouchUpInside];
    [bottomPanel addSubview:self.eventMonitorButton];

    // Stop Monitor Button
    self.stopMonitorButton = [UIButton buttonWithType:UIButtonTypeSystem];
    [self.stopMonitorButton setTitle:@"Stop Monitor" forState:UIControlStateNormal];
    self.stopMonitorButton.backgroundColor = [UIColor colorWithRed:0.8 green:0.0 blue:0.0 alpha:1.0];
    [self.stopMonitorButton setTitleColor:[UIColor whiteColor] forState:UIControlStateNormal];
    self.stopMonitorButton.layer.cornerRadius = 8;
    self.stopMonitorButton.enabled = NO;
    [self.stopMonitorButton addTarget:self action:@selector(stopEventMonitoring:) forControlEvents:UIControlEventTouchUpInside];
    [bottomPanel addSubview:self.stopMonitorButton];

    // Download Progress View
    self.downloadProgressView = [[UIProgressView alloc] initWithFrame:CGRectZero];
    self.downloadProgressView.progress = 0.0;
    self.downloadProgressView.hidden = YES;
    [bottomPanel addSubview:self.downloadProgressView];

    NSLog(@"Custom UI elements created successfully");
}

// Keeps the programmatic UI from covering storyboard controls.
- (void)layoutCustomUI {
    if (!customUISetup || !bottomPanel) {
        return;
    }

    CGFloat padding = 10;
    CGFloat panelPadding = 12;
    CGFloat labelHeight = 22;
    CGFloat buttonHeight = 40;
    CGFloat eventLogHeight = 60;

    UIEdgeInsets insets = UIEdgeInsetsZero;
    if (@available(iOS 11.0, *)) {
        insets = self.view.safeAreaInsets;
    }

    CGFloat screenWidth = self.view.bounds.size.width;
    CGFloat screenHeight = self.view.bounds.size.height;

    CGFloat panelWidth = screenWidth - 2 * padding;
    CGFloat panelHeight = panelPadding + labelHeight + 6 + labelHeight + 8 + eventLogHeight + 10 + buttonHeight + 10 + 2 + panelPadding;
    CGFloat panelX = padding;
    CGFloat panelY = screenHeight - insets.bottom - padding - panelHeight;

    // If something is very small, keep it on-screen.
    if (panelY < insets.top + padding) {
        panelY = insets.top + padding;
    }

    bottomPanel.frame = CGRectMake(panelX, panelY, panelWidth, panelHeight);

    CGFloat x = panelPadding;
    CGFloat y = panelPadding;
    CGFloat w = panelWidth - 2 * panelPadding;

    self.statusLabel.frame = CGRectMake(x, y, w, labelHeight);
    y += labelHeight + 6;

    self.photoCountLabel.frame = CGRectMake(x, y, w, labelHeight);
    y += labelHeight + 8;

    self.eventLogLabel.frame = CGRectMake(x, y, w, eventLogHeight);
    y += eventLogHeight + 10;

    CGFloat buttonW = (w - panelPadding) / 2.0;
    self.eventMonitorButton.frame = CGRectMake(x, y, buttonW, buttonHeight);
    self.stopMonitorButton.frame = CGRectMake(x + buttonW + panelPadding, y, buttonW, buttonHeight);
    y += buttonHeight + 10;

    self.downloadProgressView.frame = CGRectMake(x, y, w, 2);
}

/**
 * Updates the status label and changes color based on state
 */
- (void)updateStatusLabel:(NSString *)status color:(UIColor *)color {
    dispatch_async(dispatch_get_main_queue(), ^{
        self.statusLabel.text = status;
        self.statusLabel.textColor = color;
    });
}

/**
 * Updates the photo count label
 */
- (void)updatePhotoCount:(int)count {
    dispatch_async(dispatch_get_main_queue(), ^{
        self.photoCountLabel.text = [NSString stringWithFormat:@"Photos Detected: %d (Total on camera: %d)",
                                     count, self.totalPhotosOnCamera];
    });
}

/**
 * Adds an entry to the event log and updates UI
 */
- (void)logEvent:(NSString *)event {
    NSDateFormatter *formatter = [[NSDateFormatter alloc] init];
    formatter.dateFormat = @"HH:mm:ss";
    NSString *timestamp = [formatter stringFromDate:[NSDate date]];
    NSString *logEntry = [NSString stringWithFormat:@"[%@] %@", timestamp, event];

    [self.eventLog addObject:logEntry];
    NSLog(@"%@", logEntry);

    // Keep only last 5 events
    if (self.eventLog.count > 5) {
        [self.eventLog removeObjectAtIndex:0];
    }

    // Update event log label
    dispatch_async(dispatch_get_main_queue(), ^{
        NSString *displayLog = @"Recent Events:\n";
        for (NSString *entry in self.eventLog) {
            displayLog = [displayLog stringByAppendingFormat:@"%@\n", entry];
        }
        self.eventLogLabel.text = displayLog;
    });
}

#pragma mark - GPhoto2 Context Functions

static void
ctx_error_func (GPContext *context, const char *str, void *data)
{
    fprintf  (stderr, "\n*** Contexterror ***              \n%s\n",str);
    fflush   (stderr);
    NSLog(@"GPhoto2 Context Error: %s", str);
}

static void
ctx_status_func (GPContext *context, const char *str, void *data)
{
    fprintf  (stderr, "%s\n", str);
    fflush   (stderr);
}

GPContext* sample_create_context() {
    GPContext *context;
    context = gp_context_new();
    gp_context_set_error_func (context, ctx_error_func, NULL);
    gp_context_set_status_func (context, ctx_status_func, NULL);
    return context;
}

static void errordumper(GPLogLevel level, const char *domain, const char *str,
                        void *data) {
    fprintf(stdout, "%s\n", str);
}

static void logdumper(GPLogLevel level, const char *domain, const char *str,
                        void *data) {
    fprintf(stdout, "%s\n", str);
}

/**
 * Connects to the camera using libgphoto2
 * @param cameraIP IP address of the camera (usually 192.168.1.1 for Canon WiFi)
 * @return GP_OK (0) on success, error code otherwise
 */
-(int)connectCamera:(NSString*)cameraIP
{
    int        ret,indexCamera,indexPort;
    CameraAbilitiesList    *abilities;
    CameraAbilities    a;

    GPPortInfoList        *portinfolist = NULL;
    GPPortInfo    pi;

    NSString *connectionStr = [NSString stringWithFormat:@"%@:%@",self.protocol,cameraIP];

    NSLog(@"=== Starting Camera Connection ===");
    NSLog(@"Camera IP: %@", cameraIP);
    NSLog(@"Camera Model: %@", self.cameraModel);
    NSLog(@"Protocol: %@", self.protocol);
    NSLog(@"Connection String: %@", connectionStr);

    // Setup logging and context
    gp_log_add_func(GP_LOG_ERROR, errordumper, NULL);
    gp_log_add_func(GP_LOG_DEBUG, logdumper, NULL);
    context = sample_create_context();
    gp_camera_new (&camera);

    NSLog(@"Looking up camera abilities for: %@", self.cameraModel);
    gp_abilities_list_new (&abilities);
    ret = gp_abilities_list_load (abilities, context);
    indexCamera = gp_abilities_list_lookup_model (abilities, [self.cameraModel UTF8String]);

    if (indexCamera>=0) {
        NSLog(@"Found camera model at index: %d", indexCamera);
        gp_abilities_list_get_abilities (abilities, indexCamera, &a);
        gp_camera_set_abilities (camera, a);
    } else {
        NSLog(@"ERROR: Camera model not found in abilities list!");
        [self logEvent:@"ERROR: Camera model not found"];
    }

    NSLog(@"Setting up port info for: %@", connectionStr);
    gp_port_info_list_new (&portinfolist);
    ret = gp_port_info_list_load (portinfolist);
    int portCount = gp_port_info_list_count (portinfolist);
    NSLog(@"Found %d ports in port info list", portCount);

    indexPort = gp_port_info_list_lookup_path (portinfolist, [connectionStr UTF8String]);
    if (indexPort>=0) {
        NSLog(@"Found port at index: %d", indexPort);
        gp_port_info_list_get_info (portinfolist, indexPort, &pi);
        gp_camera_set_port_info (camera, pi);
    } else {
        NSLog(@"ERROR: Port not found in port info list!");
        [self logEvent:@"ERROR: Port not found"];
    }

    gp_port_info_list_free(portinfolist);
    gp_abilities_list_free(abilities);

    // Configure ptpip settings (Canon doesn't need Fuji-specific settings)
    NSLog(@"Configuring ptpip settings...");
    gp_setting_set("ptpip", "hostname", "sabaipics-ipad");

    // Fail fast if the target IP is not reachable on the PTP/IP port.
    // libgphoto2's connect can block for a while on wrong IPs.
    const int ptpipPort = 15740;
    if (!tcp_connect_with_timeout([cameraIP UTF8String], ptpipPort, 1500)) {
        NSLog(@"ERROR: Preflight failed: cannot connect to %@@%d", cameraIP, ptpipPort);
        [self logEvent:[NSString stringWithFormat:@"Preflight failed: %@:%d not reachable", cameraIP, ptpipPort]];
        return GP_ERROR_IO;
    }

    // For Canon, we don't need Fuji mode settings
    // These are commented out but kept for reference
    // gp_setting_set("ptpip", "fuji_mode", "browse");
    // gp_setting_set("ptpip", "fuji_mode", "pc_autosave");
    // gp_setting_set("ptpip", "fuji_mode", "browse_legacy");

    NSLog(@"Initializing camera connection...");
    [self logEvent:@"Initializing connection..."];
    ret = gp_camera_init (camera, context);

    if (ret == GP_OK) {
        NSLog(@"Camera initialized successfully!");
        self.deviceInfo = camera->pl->params.deviceinfo;

        PTPParams *params;
        params = &(camera->pl->params);

        // Log device info
        if (params->deviceinfo.Model) {
            NSLog(@"Connected to: %s", params->deviceinfo.Model);
            [self logEvent:[NSString stringWithFormat:@"Connected: %s", params->deviceinfo.Model]];
        }
        if (params->deviceinfo.Manufacturer) {
            NSLog(@"Manufacturer: %s", params->deviceinfo.Manufacturer);
        }
        if (params->deviceinfo.SerialNumber) {
            NSLog(@"Serial Number: %s", params->deviceinfo.SerialNumber);
        }
    } else {
        const char *errStr = gp_result_as_string(ret);
        NSLog(@"ERROR: Camera initialization failed with code: %d (%s)", ret, errStr ? errStr : "unknown");
        [self logEvent:[NSString stringWithFormat:@"Connection failed: %d (%s)", ret, errStr ? errStr : "unknown"]];
    }

    NSLog(@"=== Connection Attempt Complete (return code: %d) ===", ret);
    return ret;
}

-(int)listAlFiles:(const char*)folder foundfile:(int*)foundfile files:(NSMutableArray*)files
{
    int        i, ret;
    CameraList    *list;
    const char    *newfile;
    PTPParams *params;
    params =&(camera->pl->params);
    
    ret = gp_list_new (&list);
    if (ret < GP_OK) {
        NSLog(@"Could not allocate list.\n");
        return ret;
    }
    ret = gp_camera_folder_list_folders (camera, folder, list, context);
    gp_list_sort (list);
    for (i = 0; i < gp_list_count (list); i++) {
        const char *newfolder;
        char *buf;
        int havefile = 0;
        
        gp_list_get_name (list, i, &newfolder);
        if (!strlen(newfolder)) continue;
        buf = malloc (strlen(folder) + 1 + strlen(newfolder) + 1);
        strcpy(buf, folder);
        if (strcmp(folder,"/"))        /* avoid double / */
            strcat(buf, "/");
        strcat(buf, newfolder);
        fprintf(stderr,"newfolder=%s\n", newfolder);
        ret = [self listAlFiles:buf foundfile:&havefile files:files];
        free (buf);
        if (ret != GP_OK) {
            gp_list_free (list);
            NSLog(@"Failed to recursively list folders.\n");
            return ret;
        }
    }
    gp_list_reset (list);
    ret = gp_camera_folder_list_files (camera, folder, list, context);
    if (ret < GP_OK) {
        gp_list_free (list);
        NSLog(@"Could not list files.\n");
        return ret;
    }
    gp_list_sort (list);
    if (gp_list_count (list) <= 0) {
        gp_list_free (list);
        return GP_OK;
    }
    int j;
    for (j = 0; j < gp_list_count (list); j++) {
        ret = gp_list_get_name (list, j, &newfile); /* only entry 0 needed */
        CameraFileInfo    fileinfo;
        ret = gp_camera_file_get_info (camera, folder, newfile, &fileinfo, context);
        if (ret != GP_OK) {
            NSLog(@"Could not get file info.\n");
        } else {
            NSString *title = [[NSString alloc] initWithUTF8String:newfile];
            NSString *path = [[NSString alloc] initWithUTF8String:folder];
            [files addObject:[path stringByAppendingPathComponent:title]];
        }
    }
    
    if (foundfile) *foundfile = 1;
    gp_list_free (list);
    
    return GP_OK;
}


-(IBAction)downloadFile:(id)sender
{
  
    NSString *name = @"DSCF7084.RAF";
    static int buffersize = 1*1024*1024;
    long long filesize = 42660112;
    long long offset = 0;
    char* buffer = malloc(buffersize);
    uint64_t readSize = buffersize;
    NSOutputStream *outPutStream = [NSOutputStream outputStreamToFileAtPath:@"/Users/hendrikh/Desktop/test.jpg" append:NO];
    [outPutStream open];
    while (offset < filesize) {
        //store_10000001
        int ret = gp_camera_file_read(camera, "/store_10000001", [name UTF8String], GP_FILE_TYPE_NORMAL, offset, buffer, &readSize, context);
        NSLog(@"Read finished with %i",ret);
        offset = offset + readSize;
        NSLog(@"Download progress %.2lld %.2lld",offset,filesize);
        if ([outPutStream write:(const uint8_t *)buffer maxLength:readSize]<=0 || ret!=GP_OK) {
            NSLog(@"Download aborted");
            break;
        }
    }
    [outPutStream close];
    free(buffer);
}

/**
 * Handles the connection process to the camera
 * Runs connection on background thread and updates UI on main thread
 */
-(void)doConnect
{
    UIApplication.sharedApplication.networkActivityIndicatorVisible = YES;
    NSString *ip = self.ipTextField.text;

    if (ip != nil && ![ip isEqualToString:@""]) {
        if (!_connected) {
            NSLog(@"Starting connection process to IP: %@", ip);
            [self updateStatusLabel:@"Status: Connecting..." color:[UIColor orangeColor]];
            [self logEvent:[NSString stringWithFormat:@"Connecting to %@...", ip]];

            dispatch_async(dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_DEFAULT, 0), ^{
                int ret = [self connectCamera:ip];

                dispatch_async(dispatch_get_main_queue(), ^{
                    if (ret == GP_OK) {
                        // Connection successful
                        self.listButton.enabled = YES;
                        self.eventMonitorButton.enabled = YES;
                        self.connected = YES;

                        NSString *successMsg = [NSString stringWithFormat:
                            @"Connected to Sony PTP/IP!\n\n"
                            @"Camera: %@\n"
                            @"IP: %@\n"
                            @"Protocol: %@\n\n"
                            @"Ready for event monitoring.\n"
                            @"Tap 'Start Event Monitor' to watch for new photos.",
                            self.cameraModel, ip, self.protocol];

                        self.consoleTextView.text = successMsg;
                        [self updateStatusLabel:@"Status: Connected" color:[UIColor greenColor]];
                        [self logEvent:@"Connection successful!"];

                        // Disable connect buttons
                        self.connectButtonPTP.enabled = NO;
                        self.connectButtonLumix.enabled = NO;

                        NSLog(@"Connection successful - UI updated");
                    } else {
                        // Connection failed
                        const char *errStr = gp_result_as_string(ret);
                        NSString *errorMsg = [NSString stringWithFormat:
                            @"Connection Failed!\n\n"
                            @"Error code: %d (%s)\n\n"
                            @"Troubleshooting:\n"
                            @"1. Make sure camera WiFi is enabled\n"
                            @"2. Check iPad is connected to camera's WiFi\n"
                            @"3. Verify camera IP is %@\n"
                            @"4. Try restarting camera WiFi\n"
                            @"5. Check camera is in correct mode",
                            ret, (errStr ? errStr : "unknown"), ip];

                        self.consoleTextView.text = errorMsg;
                        [self updateStatusLabel:@"Status: Connection Failed" color:[UIColor redColor]];
                        [self logEvent:[NSString stringWithFormat:@"Connection failed: %d", ret]];

                        NSLog(@"Connection failed with error code: %d", ret);
                    }
                    UIApplication.sharedApplication.networkActivityIndicatorVisible = NO;
                });
            });
        } else {
            NSLog(@"Already connected to camera");
            [self logEvent:@"Already connected"];
        }
    } else {
        NSLog(@"ERROR: No IP address provided");
        [self logEvent:@"ERROR: No IP address"];
        [self updateStatusLabel:@"Status: No IP Address" color:[UIColor redColor]];
    }
}

/**
 * Connect button action for Sony PTP/IP camera
 * Pre-configures settings for Sony PTP/IP connection
 */
- (IBAction)connectTouchedPTP:(id)sender {
    NSLog(@"=== Connect to Sony (PTP/IP) Button Pressed ===");
    self.protocol = CANON_PROTOCOL;  // "ptpip"
    self.cameraModel = CANON_CAMERA_MODEL;  // "PTP/IP Camera"

    // Ensure IP is set to default if empty
    if (!self.ipTextField.text || [self.ipTextField.text isEqualToString:@""]) {
        self.ipTextField.text = CANON_WIFI_IP;
    }

    [self doConnect];
}

/**
 * Connect button action for Fuji camera (kept for reference)
 */
- (IBAction)connectFujiTouched:(id)sender {
    NSLog(@"=== Connect to Fuji Button Pressed ===");
    self.protocol = @"ptpip";
    self.cameraModel = @"Fuji X (WLAN)";
    [self doConnect];
}

- (IBAction)connectLumixTouched:(id)sender {
    self.protocol = @"ip";
    self.cameraModel = @"Panasonic LumixGSeries";
    [self doConnect];
}

-(NSInteger)indexForFileCount:(uint16_t*)events count:(uint16_t)count
{
    NSInteger returnIndex = -1;
    for (NSInteger i=0;i<count;i++) {
        if (events[i]==0xd222) {
            returnIndex = i;
        }
        if (returnIndex==-1 && events[i]==0x220) {
            returnIndex = i;
        }
    }
    return returnIndex;
}


-(void)fuji_terminate
{
    PTPParams *params = &camera->pl->params;
    ptp_closesession(params);
    close(params->cmdfd);
    close(params->evtfd);

}

-(void)displayCount
{
    PTPPropertyValue        propval;

    PTPParams *params;
    
    params =&camera->pl->params;
    params->fuji_nrofobjects = 0;
    
    propval.str = "0/220";
    ptp_setdevicepropvalue(params, 0xD228, &propval, PTP_DTC_STR);
}

-(void)registerListProgress
{
    PTPParams *params;
    params =&camera->pl->params;
    
    params->fuji_list_progress = ^(uint32_t progress, uint32_t total) {
        NSLog(@"====> List progress %i of %i",progress,total);
    };
}

-(void)deregisterListProgress
{
    PTPParams *params;
    params =&camera->pl->params;
    params->fuji_list_progress = NULL;
}

-(void)fuji_switchToBrowse
{
    PTPPropertyValue        propval;

    PTPParams *params;
    
    params =&camera->pl->params;
    params->fuji_nrofobjects = 0;
    

    uint16_t count = 0;
    uint16_t *events = NULL;
    uint32_t * values = NULL;
    
    char mode[100];
    gp_setting_get("ptpip", "fuji_mode", mode);
    
    CameraEventType  evttype;
    void    *evtdata;
    
    if (strcmp(mode, "tethering") == 0 || strcmp(mode, "push") == 0 ) {
        while (1) {
            int retval = gp_camera_wait_for_event (camera, 1000, &evttype, &evtdata, context);
            if (retval != GP_OK) break;
            switch (evttype) {
                case GP_EVENT_UNKNOWN: {
                    NSLog(@"Event unknown");
                    break;
                }
                case GP_EVENT_TIMEOUT: {
                    NSLog(@"Event timeout");
                    break;
                }
                case GP_EVENT_FILE_ADDED: {
                    NSLog(@"File added");
                    CameraFilePath *cameraFilePath = (CameraFilePath*)evtdata;
                    CameraFileInfo info;
                    retval = gp_camera_file_get_info (camera, cameraFilePath->folder, cameraFilePath->name, &info, context);
                    NSLog(@"Info %@:%@",[[NSString alloc] initWithUTF8String:cameraFilePath->folder],[[NSString alloc] initWithUTF8String:cameraFilePath->name]);
                    NSString *savePath = [@"/Users/hendrikh/Desktop/fuji_save/" stringByAppendingString:[[NSString alloc] initWithUTF8String:cameraFilePath->name]];
                    CameraFile *file;
                    int fd = open ([savePath UTF8String], O_CREAT | O_WRONLY, 0644);
                    retval = gp_file_new_from_fd(&file, fd);
                    if (retval == GP_OK) {
                        params->fuji_tether_progress = ^(uint64_t bytesWritten, uint64_t totalBytes) {
                            NSLog(@"Progress called %.2lld of %.2lld",bytesWritten, totalBytes);
                        };
                        retval = gp_camera_file_get(camera, cameraFilePath->folder, cameraFilePath->name,
                                                    GP_FILE_TYPE_NORMAL, file, context);
                        params->fuji_tether_progress = NULL;
                        NSLog(@"saved %@",[[NSString alloc] initWithUTF8String:cameraFilePath->name]);
                    }
                }case GP_EVENT_FOLDER_ADDED: {
                    NSLog(@"Folder added");

                    break;
                }
                case GP_EVENT_CAPTURE_COMPLETE: {
                    NSLog(@"Capture completed");
                    break;
                }
                case GP_EVENT_FILE_CHANGED: {
                    NSLog(@"File changed");
                    break;
                }
                    
            }
        }

    } else if (strcmp(mode, "pc_autosave") == 0) {
        ptp_fuji_getevents (params, &events, &values, &count);
        NSInteger fileIndex = [self indexForFileCount:events count:count];
        if (fileIndex!=-1) {
            params->fuji_nrofobjects = values[fileIndex];
        }
        propval.u16 = 0x0001;
        ptp_setdevicepropvalue(params, 0xD227, &propval, PTP_DTC_UINT16);
        ptp_fuji_getevents (params, &events, &values, &count);
    } else {
        
        if (strcmp(mode, "browse_legacy") != 0) {
            ptp_fuji_getevents (params, &events, &values, &count);
            ptp_terminateopencapture(params,params->opencapture_transid);
            ptp_fuji_getevents (params, &events, &values, &count);
        }
        
        propval.u16 = 0x0006;
        ptp_setdevicepropvalue(params, 0xDF00, &propval, PTP_DTC_UINT16);
        ptp_fuji_getevents (params, &events, &values, &count);

        NSInteger fileIndex = [self indexForFileCount:events count:count];
        if (fileIndex!=-1) {
            params->fuji_nrofobjects = values[fileIndex];
        }

        ptp_getdevicepropvalue(params, 0xDF25, &propval, PTP_DTC_UINT32);
        ptp_fuji_getevents (params, &events, &values, &count);

        propval.u16 = 0x000B;
        ptp_setdevicepropvalue(params, 0xDF01, &propval, PTP_DTC_UINT16);

        propval.u32 = 0x00020004;
        ptp_setdevicepropvalue(params, 0xDF25, &propval, PTP_DTC_UINT32);
        ptp_fuji_getevents (params, &events, &values, &count);
        
        propval.u16 = 0x0001;
        ptp_setdevicepropvalue(params, 0xD227, &propval, PTP_DTC_UINT16);
        ptp_fuji_getevents (params, &events, &values, &count);

        self.fuji_browse_active = YES;
    }
}

#pragma mark - Event Monitoring

/**
 * Starts event monitoring for new photos
 * Runs on background queue and watches for GP_EVENT_FILE_ADDED events
 */
- (IBAction)startEventMonitoring:(id)sender {
    if (!self.connected) {
        NSLog(@"ERROR: Cannot start monitoring - not connected to camera");
        [self logEvent:@"ERROR: Not connected"];
        return;
    }

    if (self.isMonitoring) {
        NSLog(@"Event monitoring already running");
        [self logEvent:@"Already monitoring"];
        return;
    }

    NSLog(@"=== Starting Event Monitoring ===");
    [self logEvent:@"Event monitor started"];
    self.isMonitoring = YES;

    // Update UI
    dispatch_async(dispatch_get_main_queue(), ^{
        self.eventMonitorButton.enabled = NO;
        self.stopMonitorButton.enabled = YES;
        self.consoleTextView.text = @"Event Monitor Active\n\n"
                                    @"Watching for new photos...\n"
                                    @"Take a photo on your camera to test.\n\n"
                                    @"Events will appear below.";
        [self updateStatusLabel:@"Status: Monitoring Events" color:[UIColor blueColor]];
    });

    // Create background queue for event monitoring
    if (!eventMonitorQueue) {
        eventMonitorQueue = dispatch_queue_create("com.sabaipics.eventmonitor", DISPATCH_QUEUE_SERIAL);
    }

    // Start event loop on background queue
    dispatch_async(eventMonitorQueue, ^{
        [self runEventMonitorLoop];
    });
}

/**
 * Stops event monitoring
 */
- (IBAction)stopEventMonitoring:(id)sender {
    NSLog(@"=== Stopping Event Monitoring ===");
    [self logEvent:@"Event monitor stopped"];
    self.isMonitoring = NO;

    // Update UI
    dispatch_async(dispatch_get_main_queue(), ^{
        self.eventMonitorButton.enabled = YES;
        self.stopMonitorButton.enabled = NO;
        [self updateStatusLabel:@"Status: Connected" color:[UIColor greenColor]];

        NSString *summary = [NSString stringWithFormat:
            @"Event Monitor Stopped\n\n"
            @"Total photos detected: %d\n\n"
            @"Recent events logged above.",
            self.detectedPhotoCount];
        self.consoleTextView.text = summary;
    });
}

/**
 * Main event monitoring loop
 * Continuously polls camera for events while isMonitoring is YES
 * Handles different event types, especially GP_EVENT_FILE_ADDED
 */
- (void)runEventMonitorLoop {
    NSLog(@"Event monitor loop started");
    int loopCount = 0;

    while (self.isMonitoring) {
        @autoreleasepool {
            CameraEventType eventType;
            void *eventData;

            // Wait for events from camera (1000ms timeout)
            int ret = gp_camera_wait_for_event(camera, 1000, &eventType, &eventData, context);

            if (ret != GP_OK) {
                NSLog(@"Error waiting for event: %d", ret);
                [self logEvent:[NSString stringWithFormat:@"Event error: %d", ret]];

                // If error persists, stop monitoring
                if (ret != GP_ERROR_TIMEOUT) {
                    dispatch_async(dispatch_get_main_queue(), ^{
                        [self stopEventMonitoring:nil];
                    });
                    break;
                }
                continue;
            }

            // Handle different event types
            switch (eventType) {
                case GP_EVENT_UNKNOWN: {
                    NSLog(@"Event: UNKNOWN");
                    char *eventStr = (char *)eventData;
                    if (eventStr) {
                        NSLog(@"  Unknown event data: %s", eventStr);
                        [self logEvent:[NSString stringWithFormat:@"Unknown: %s", eventStr]];
                    }
                    break;
                }

                case GP_EVENT_TIMEOUT: {
                    // Timeout is normal - just means no events in the last second
                    loopCount++;
                    if (loopCount % 10 == 0) {
                        NSLog(@"Event monitor running... (loop %d)", loopCount);
                    }
                    break;
                }

                case GP_EVENT_FILE_ADDED: {
                    // NEW PHOTO DETECTED!
                    CameraFilePath *filePath = (CameraFilePath *)eventData;
                    NSString *folder = [NSString stringWithUTF8String:filePath->folder];
                    NSString *filename = [NSString stringWithUTF8String:filePath->name];
                    NSString *fullPath = [folder stringByAppendingPathComponent:filename];

                    NSLog(@"=== NEW PHOTO DETECTED ===");
                    NSLog(@"File: %@", filename);
                    NSLog(@"Folder: %@", folder);
                    NSLog(@"Full Path: %@", fullPath);
                    NSLog(@"========================");

                    self.detectedPhotoCount++;
                    [self.detectedPhotosList addObject:fullPath];

                    NSString *eventMsg = [NSString stringWithFormat:@"New photo: %@", filename];
                    [self logEvent:eventMsg];
                    [self updatePhotoCount:self.detectedPhotoCount];

                    // Get file info
                    CameraFileInfo fileInfo;
                    ret = gp_camera_file_get_info(camera, filePath->folder, filePath->name, &fileInfo, context);
                    if (ret == GP_OK) {
                        if (fileInfo.file.fields & GP_FILE_INFO_SIZE) {
                            long fileSize = fileInfo.file.size;
                            NSLog(@"File size: %ld bytes (%.2f MB)", fileSize, fileSize / 1024.0 / 1024.0);
                        }
                        if (fileInfo.file.fields & GP_FILE_INFO_TYPE) {
                            NSLog(@"File type: %s", fileInfo.file.type);
                        }
                    }

                    // Attempt to download the file to app Documents
                    CameraFile *downloadFile = NULL;
                    ret = gp_file_new(&downloadFile);
                    if (ret != GP_OK) {
                        NSLog(@"ERROR: gp_file_new failed: %d", ret);
                        [self logEvent:[NSString stringWithFormat:@"Download init failed: %d", ret]];
                        break;
                    }

                    ret = gp_camera_file_get(camera, filePath->folder, filePath->name, GP_FILE_TYPE_NORMAL, downloadFile, context);
                    if (ret != GP_OK) {
                        NSLog(@"ERROR: gp_camera_file_get failed: %d", ret);
                        [self logEvent:[NSString stringWithFormat:@"Download failed: %d", ret]];
                        gp_file_free(downloadFile);
                        break;
                    }

                    const char *data = NULL;
                    unsigned long int dataSize = 0;
                    ret = gp_file_get_data_and_size(downloadFile, &data, &dataSize);
                    if (ret != GP_OK || data == NULL || dataSize == 0) {
                        NSLog(@"ERROR: gp_file_get_data_and_size failed: %d (size=%lu)", ret, dataSize);
                        [self logEvent:[NSString stringWithFormat:@"Download data failed: %d", ret]];
                        gp_file_free(downloadFile);
                        break;
                    }

                    NSData *photoData = [NSData dataWithBytes:data length:(NSUInteger)dataSize];
                    NSString *documentsDir = NSSearchPathForDirectoriesInDomains(NSDocumentDirectory, NSUserDomainMask, YES).firstObject;
                    NSString *savePath = [documentsDir stringByAppendingPathComponent:filename];
                    BOOL wrote = [photoData writeToFile:savePath atomically:YES];
                    gp_file_free(downloadFile);

                    if (wrote) {
                        NSLog(@"Downloaded %@ (%lu bytes) -> %@", filename, dataSize, savePath);
                        [self logEvent:[NSString stringWithFormat:@"Downloaded: %@ (%lu bytes)", filename, dataSize]];
                    } else {
                        NSLog(@"ERROR: Failed to write file to %@", savePath);
                        [self logEvent:[NSString stringWithFormat:@"Write failed: %@", filename]];
                    }

                    // Update console with new photo info
                    dispatch_async(dispatch_get_main_queue(), ^{
                        NSString *consoleText = [NSString stringWithFormat:
                            @"NEW PHOTO DETECTED!\n\n"
                            @"File: %@\n"
                            @"Path: %@\n\n"
                            @"Saved to Documents: %@\n\n"
                            @"Total detected: %d\n\n"
                            @"Event monitor still running...",
                            filename, fullPath, savePath, self.detectedPhotoCount];
                        self.consoleTextView.text = consoleText;
                    });

                    break;
                }

                case GP_EVENT_FOLDER_ADDED: {
                    CameraFilePath *folderPath = (CameraFilePath *)eventData;
                    NSString *folder = [NSString stringWithUTF8String:folderPath->folder];
                    NSString *name = [NSString stringWithUTF8String:folderPath->name];
                    NSLog(@"Event: FOLDER_ADDED - %@/%@", folder, name);
                    [self logEvent:[NSString stringWithFormat:@"Folder added: %@", name]];
                    break;
                }

                case GP_EVENT_CAPTURE_COMPLETE: {
                    NSLog(@"Event: CAPTURE_COMPLETE");
                    [self logEvent:@"Capture complete"];
                    break;
                }

                case GP_EVENT_FILE_CHANGED: {
                    CameraFilePath *filePath = (CameraFilePath *)eventData;
                    NSString *filename = [NSString stringWithUTF8String:filePath->name];
                    NSLog(@"Event: FILE_CHANGED - %@", filename);
                    [self logEvent:[NSString stringWithFormat:@"File changed: %@", filename]];
                    break;
                }

                default: {
                    NSLog(@"Event: UNKNOWN_TYPE (%d)", eventType);
                    break;
                }
            }

            // Free event data if needed
            if (eventData) {
                free(eventData);
            }
        }
    }

    NSLog(@"Event monitor loop stopped");
}

#pragma mark - File Operations

/**
 * Lists all files on the camera
 * For Canon cameras, this will list all photos in their current storage
 */
- (IBAction)listTouched:(id)sender {
    if (!self.connected) {
        NSLog(@"ERROR: Cannot list files - not connected to camera");
        [self logEvent:@"ERROR: Not connected"];
        return;
    }

    NSLog(@"=== Starting File List ===");
    [self logEvent:@"Listing files..."];

    // Note: Fuji-specific code kept for reference but not used for Canon
    if (!self.fuji_browse_active) {
        // [self fuji_switchToBrowse];  // Not needed for Canon
    }

    char mode[100];
    gp_setting_get("ptpip", "fuji_mode", mode);

    if (strcmp(mode, "tethering") == 0 || strcmp(mode, "push") == 0) {
        NSLog(@"Cannot list files in tethering/push mode");
        return;
    }

    [self registerListProgress];
    UIApplication.sharedApplication.networkActivityIndicatorVisible = YES;

    dispatch_async(dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_DEFAULT, 0), ^{
        NSMutableArray *allfiles = [NSMutableArray new];

        int ret = [self listAlFiles:"/" foundfile:NULL files:allfiles];
        if (ret == GP_OK) {
            NSLog(@"Successfully listed %lu files", (unsigned long)allfiles.count);
            self.totalPhotosOnCamera = (int)allfiles.count;

            NSString *outText = [NSString stringWithFormat:@"Found %d files on camera:\n\n", self.totalPhotosOnCamera];
            for (NSString* item in allfiles) {
                outText = [outText stringByAppendingFormat:@"%@\n",item];
            }

            dispatch_async(dispatch_get_main_queue(), ^{
                [self deregisterListProgress];
                [self displayCount];
                UIApplication.sharedApplication.networkActivityIndicatorVisible = NO;
                self.consoleTextView.text = outText;
                [self updatePhotoCount:self.detectedPhotoCount];
                [self logEvent:[NSString stringWithFormat:@"Listed %d files", self.totalPhotosOnCamera]];
            });
        } else {
            NSLog(@"ERROR: Failed to list files, return code: %d", ret);
            dispatch_async(dispatch_get_main_queue(), ^{
                [self deregisterListProgress];
                UIApplication.sharedApplication.networkActivityIndicatorVisible = NO;
                self.consoleTextView.text = [NSString stringWithFormat:@"Failed to list files\nError code: %d", ret];
                [self logEvent:[NSString stringWithFormat:@"List failed: %d", ret]];
            });
        }
    });
}


@end
