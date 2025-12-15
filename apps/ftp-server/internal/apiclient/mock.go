package apiclient

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"sync"
	"sync/atomic"
	"time"
)

// MockClient is a mock implementation of APIClient for testing
type MockClient struct {
	mu sync.Mutex

	// Configurable responses
	AuthResponse    *AuthResponse
	AuthError       error
	UploadResponse  *UploadResponse
	UploadError     error
	UploadHTTPStatus int // For simulating 401, 429, etc.

	// Call tracking
	AuthCalls   []AuthRequest
	UploadCalls []MockUploadCall
	authCount   atomic.Int64
	uploadCount atomic.Int64
}

// MockUploadCall records details of an upload call
type MockUploadCall struct {
	Token    string
	EventID  string
	Filename string
	Size     int64
	Time     time.Time
}

// NewMockClient creates a new mock client with default success responses
func NewMockClient() *MockClient {
	return &MockClient{
		AuthResponse: &AuthResponse{
			Token:            "mock-jwt-token",
			EventID:          "evt_test123",
			EventName:        "Test Event",
			UploadWindowEnd:  time.Now().Add(24 * time.Hour).Format(time.RFC3339),
			CreditsRemaining: 1000,
		},
		UploadResponse: &UploadResponse{
			Data: struct {
				ID                string `json:"id"`
				Status            string `json:"status"`
				Filename          string `json:"filename"`
				SizeBytes         int64  `json:"size_bytes"`
				UploadCompletedAt string `json:"upload_completed_at"`
				R2Key             string `json:"r2_key"`
			}{
				ID:                "photo_test123",
				Status:            "uploaded",
				Filename:          "",
				SizeBytes:         0,
				UploadCompletedAt: time.Now().Format(time.RFC3339),
				R2Key:             "",
			},
		},
		AuthCalls:   []AuthRequest{},
		UploadCalls: []MockUploadCall{},
	}
}

// Authenticate implements APIClient.Authenticate
func (m *MockClient) Authenticate(ctx context.Context, req AuthRequest) (*AuthResponse, error) {
	m.mu.Lock()
	m.AuthCalls = append(m.AuthCalls, req)
	m.mu.Unlock()
	m.authCount.Add(1)

	if m.AuthError != nil {
		return nil, m.AuthError
	}

	return m.AuthResponse, nil
}

// UploadFormData implements APIClient.UploadFormData
func (m *MockClient) UploadFormData(ctx context.Context, token, eventID, filename string, reader io.Reader) (*UploadResponse, *http.Response, error) {
	// Read all data to get size
	data, err := io.ReadAll(reader)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to read upload data: %w", err)
	}

	m.mu.Lock()
	m.UploadCalls = append(m.UploadCalls, MockUploadCall{
		Token:    token,
		EventID:  eventID,
		Filename: filename,
		Size:     int64(len(data)),
		Time:     time.Now(),
	})
	m.mu.Unlock()
	m.uploadCount.Add(1)

	// Create mock HTTP response for status code checking
	mockResp := &http.Response{
		StatusCode: http.StatusOK,
	}

	if m.UploadHTTPStatus > 0 {
		mockResp.StatusCode = m.UploadHTTPStatus
	}

	if m.UploadError != nil {
		return nil, mockResp, m.UploadError
	}

	// Update response with actual filename and size
	resp := *m.UploadResponse
	resp.Data.Filename = filename
	resp.Data.SizeBytes = int64(len(data))
	resp.Data.R2Key = "events/" + eventID + "/" + filename

	return &resp, mockResp, nil
}

// GetAuthCallCount returns the number of auth calls (thread-safe)
func (m *MockClient) GetAuthCallCount() int {
	return int(m.authCount.Load())
}

// GetUploadCallCount returns the number of upload calls (thread-safe)
func (m *MockClient) GetUploadCallCount() int {
	return int(m.uploadCount.Load())
}

// GetLastUploadCall returns the last upload call (thread-safe)
func (m *MockClient) GetLastUploadCall() *MockUploadCall {
	m.mu.Lock()
	defer m.mu.Unlock()
	if len(m.UploadCalls) == 0 {
		return nil
	}
	return &m.UploadCalls[len(m.UploadCalls)-1]
}

// Reset clears all recorded calls and resets to default responses
func (m *MockClient) Reset() {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.AuthCalls = []AuthRequest{}
	m.UploadCalls = []MockUploadCall{}
	m.AuthError = nil
	m.UploadError = nil
	m.UploadHTTPStatus = 0
	m.authCount.Store(0)
	m.uploadCount.Store(0)
}

// SetAuthFailure configures the mock to return an auth error
func (m *MockClient) SetAuthFailure(err error) {
	m.AuthError = err
}

// SetUploadFailure configures the mock to return an upload error with status
func (m *MockClient) SetUploadFailure(err error, httpStatus int) {
	m.UploadError = err
	m.UploadHTTPStatus = httpStatus
}

// Ensure MockClient implements APIClient
var _ APIClient = (*MockClient)(nil)
