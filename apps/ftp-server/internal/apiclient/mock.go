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
	AuthResponse      *AuthResponse
	AuthError         error
	PresignResponse   *PresignResponse
	PresignError      error
	PresignHTTPStatus int // For simulating 401, 429, etc.
	UploadError       error
	UploadHTTPStatus  int // For simulating R2 errors

	// Call tracking
	AuthCalls    []AuthRequest
	PresignCalls []MockPresignCall
	UploadCalls  []MockUploadCall
	authCount    atomic.Int64
	presignCount atomic.Int64
	uploadCount  atomic.Int64
}

// MockPresignCall records details of a presign call
type MockPresignCall struct {
	Token       string
	Filename    string
	ContentType string
	Time        time.Time
}

// MockUploadCall records details of an upload call
type MockUploadCall struct {
	PutURL  string
	Headers map[string]string
	Size    int64
	Time    time.Time
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
		PresignResponse: &PresignResponse{
			UploadID:        "upload_test123",
			PutURL:          "https://r2.example.com/bucket/test-key",
			ObjectKey:       "test-key",
			ExpiresAt:       time.Now().Add(5 * time.Minute).Format(time.RFC3339),
			RequiredHeaders: map[string]string{"Content-Type": "image/jpeg"},
		},
		AuthCalls:    []AuthRequest{},
		PresignCalls: []MockPresignCall{},
		UploadCalls:  []MockUploadCall{},
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

// Presign implements APIClient.Presign
func (m *MockClient) Presign(ctx context.Context, token, filename, contentType string) (*PresignResponse, error) {
	m.mu.Lock()
	m.PresignCalls = append(m.PresignCalls, MockPresignCall{
		Token:       token,
		Filename:    filename,
		ContentType: contentType,
		Time:        time.Now(),
	})
	m.mu.Unlock()
	m.presignCount.Add(1)

	if m.PresignError != nil {
		return nil, m.PresignError
	}

	if m.PresignHTTPStatus > 0 && m.PresignHTTPStatus != http.StatusCreated {
		switch m.PresignHTTPStatus {
		case http.StatusUnauthorized:
			return nil, ErrUnauthorized
		case http.StatusPaymentRequired:
			return nil, ErrInsufficientCredits
		case http.StatusGone:
			return nil, ErrEventExpired
		case http.StatusTooManyRequests:
			return nil, ErrRateLimited
		case http.StatusInternalServerError, http.StatusBadGateway, http.StatusServiceUnavailable:
			return nil, ErrTemporaryFailure
		default:
			return nil, fmt.Errorf("presign failed: %d", m.PresignHTTPStatus)
		}
	}

	return m.PresignResponse, nil
}

// PresignWithRetry implements APIClient.PresignWithRetry
func (m *MockClient) PresignWithRetry(ctx context.Context, token, filename, contentType string, backoff []time.Duration) (*PresignResponse, error) {
	return m.Presign(ctx, token, filename, contentType)
}

// UploadToPresignedURL implements APIClient.UploadToPresignedURL
func (m *MockClient) UploadToPresignedURL(ctx context.Context, putURL string, headers map[string]string, reader io.Reader) (*http.Response, error) {
	// Read all data to get size
	data, err := io.ReadAll(reader)
	if err != nil {
		return nil, fmt.Errorf("failed to read upload data: %w", err)
	}

	m.mu.Lock()
	m.UploadCalls = append(m.UploadCalls, MockUploadCall{
		PutURL:  putURL,
		Headers: headers,
		Size:    int64(len(data)),
		Time:    time.Now(),
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
		return mockResp, m.UploadError
	}

	return mockResp, nil
}

// GetAuthCallCount returns the number of auth calls (thread-safe)
func (m *MockClient) GetAuthCallCount() int {
	return int(m.authCount.Load())
}

// GetPresignCallCount returns the number of presign calls (thread-safe)
func (m *MockClient) GetPresignCallCount() int {
	return int(m.presignCount.Load())
}

// GetUploadCallCount returns the number of upload calls (thread-safe)
func (m *MockClient) GetUploadCallCount() int {
	return int(m.uploadCount.Load())
}

// GetLastPresignCall returns the last presign call (thread-safe)
func (m *MockClient) GetLastPresignCall() *MockPresignCall {
	m.mu.Lock()
	defer m.mu.Unlock()
	if len(m.PresignCalls) == 0 {
		return nil
	}
	return &m.PresignCalls[len(m.PresignCalls)-1]
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
	m.PresignCalls = []MockPresignCall{}
	m.UploadCalls = []MockUploadCall{}
	m.AuthError = nil
	m.PresignError = nil
	m.PresignHTTPStatus = 0
	m.UploadError = nil
	m.UploadHTTPStatus = 0
	m.authCount.Store(0)
	m.presignCount.Store(0)
	m.uploadCount.Store(0)
}

// SetAuthFailure configures the mock to return an auth error
func (m *MockClient) SetAuthFailure(err error) {
	m.AuthError = err
}

// SetPresignFailure configures the mock to return a presign error with status
func (m *MockClient) SetPresignFailure(err error, httpStatus int) {
	m.PresignError = err
	m.PresignHTTPStatus = httpStatus
}

// SetUploadFailure configures the mock to return an upload error with status
func (m *MockClient) SetUploadFailure(err error, httpStatus int) {
	m.UploadError = err
	m.UploadHTTPStatus = httpStatus
}

// Ensure MockClient implements APIClient
var _ APIClient = (*MockClient)(nil)
