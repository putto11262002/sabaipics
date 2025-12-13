package e2e

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"time"
)

// MockAPIServer mocks the SabaiPics API endpoints for testing
type MockAPIServer struct {
	*httptest.Server
	mu          sync.Mutex
	AuthCalls   []AuthCallRecord
	UploadCalls []UploadCallRecord

	// Configurable behaviors for testing error scenarios
	AuthShouldFail     bool
	UploadShouldFail   bool
	UploadReturnStatus int // 401, 429, etc.
}

// AuthCallRecord records an auth API call
type AuthCallRecord struct {
	Username string
	Password string
	Time     time.Time
}

// UploadCallRecord records an upload API call
type UploadCallRecord struct {
	Token    string
	EventID  string
	Filename string
	Size     int64
	Time     time.Time
}

// NewMockAPIServer creates a new mock API server
func NewMockAPIServer() *MockAPIServer {
	mas := &MockAPIServer{
		AuthCalls:   []AuthCallRecord{},
		UploadCalls: []UploadCallRecord{},
	}

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case strings.HasSuffix(r.URL.Path, "/api/ftp/auth"):
			mas.handleAuth(w, r)
		case strings.HasSuffix(r.URL.Path, "/api/ftp/upload"):
			mas.handleUpload(w, r)
		default:
			http.NotFound(w, r)
		}
	})

	mas.Server = httptest.NewServer(handler)
	return mas
}

func (mas *MockAPIServer) handleAuth(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var authReq struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&authReq); err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	mas.mu.Lock()
	mas.AuthCalls = append(mas.AuthCalls, AuthCallRecord{
		Username: authReq.Username,
		Password: authReq.Password,
		Time:     time.Now(),
	})
	mas.mu.Unlock()

	// Check for forced failure
	if mas.AuthShouldFail {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"error": map[string]string{
				"code":    "INVALID_CREDENTIALS",
				"message": "Invalid username or password",
			},
		})
		return
	}

	// Default: accept "test"/"pass" credentials
	if authReq.Username == "test" && authReq.Password == "pass" {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"token":             "test-jwt-token",
			"event_id":          "evt_123",
			"event_name":        "Test Event",
			"upload_window_end": time.Now().Add(24 * time.Hour).Format(time.RFC3339),
			"credits_remaining": 1000,
		})
	} else {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"error": map[string]string{
				"code":    "INVALID_CREDENTIALS",
				"message": "Invalid username or password",
			},
		})
	}
}

func (mas *MockAPIServer) handleUpload(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Verify auth header
	authHeader := r.Header.Get("Authorization")
	if !strings.HasPrefix(authHeader, "Bearer ") {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"error": map[string]string{
				"code":    "MISSING_AUTH",
				"message": "Missing or invalid authorization",
			},
		})
		return
	}

	// Check for forced failure
	if mas.UploadShouldFail && mas.UploadReturnStatus > 0 {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(mas.UploadReturnStatus)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"error": map[string]string{
				"code":    "UPLOAD_FAILED",
				"message": "Upload failed",
			},
		})
		return
	}

	// Parse multipart form
	if err := r.ParseMultipartForm(100 * 1024 * 1024); err != nil {
		http.Error(w, "Failed to parse form", http.StatusBadRequest)
		return
	}

	eventID := r.FormValue("eventId")
	file, fileHeader, err := r.FormFile("file")
	if err != nil {
		http.Error(w, "Missing file", http.StatusBadRequest)
		return
	}
	defer file.Close()

	// Read file to get size
	data, _ := io.ReadAll(file)

	mas.mu.Lock()
	mas.UploadCalls = append(mas.UploadCalls, UploadCallRecord{
		Token:    authHeader[7:], // Strip "Bearer "
		EventID:  eventID,
		Filename: fileHeader.Filename,
		Size:     int64(len(data)),
		Time:     time.Now(),
	})
	mas.mu.Unlock()

	// Return success
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"data": map[string]interface{}{
			"id":                  "photo_xyz123",
			"status":              "uploaded",
			"filename":            fileHeader.Filename,
			"size_bytes":          len(data),
			"upload_completed_at": time.Now().Format(time.RFC3339),
			"r2_key":              "events/evt_123/" + fileHeader.Filename,
		},
	})
}

// GetAuthCallCount returns the number of auth calls (thread-safe)
func (mas *MockAPIServer) GetAuthCallCount() int {
	mas.mu.Lock()
	defer mas.mu.Unlock()
	return len(mas.AuthCalls)
}

// GetUploadCallCount returns the number of upload calls (thread-safe)
func (mas *MockAPIServer) GetUploadCallCount() int {
	mas.mu.Lock()
	defer mas.mu.Unlock()
	return len(mas.UploadCalls)
}

// GetLastUpload returns the last upload call record (thread-safe)
func (mas *MockAPIServer) GetLastUpload() *UploadCallRecord {
	mas.mu.Lock()
	defer mas.mu.Unlock()
	if len(mas.UploadCalls) == 0 {
		return nil
	}
	return &mas.UploadCalls[len(mas.UploadCalls)-1]
}

// Reset clears all recorded calls
func (mas *MockAPIServer) Reset() {
	mas.mu.Lock()
	defer mas.mu.Unlock()
	mas.AuthCalls = []AuthCallRecord{}
	mas.UploadCalls = []UploadCallRecord{}
	mas.AuthShouldFail = false
	mas.UploadShouldFail = false
	mas.UploadReturnStatus = 0
}
