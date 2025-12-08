package apiclient

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"time"
)

// Client is the HTTP client for communicating with the SabaiPics API
type Client struct {
	baseURL    string
	httpClient *http.Client
}

// AuthRequest represents the FTP authentication request
type AuthRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

// AuthResponse represents the FTP authentication response
type AuthResponse struct {
	Token            string `json:"token"`
	EventID          string `json:"event_id"`
	EventName        string `json:"event_name"`
	UploadWindowEnd  string `json:"upload_window_end"`
	CreditsRemaining int    `json:"credits_remaining"`
}

// UploadResponse represents the FTP upload response
type UploadResponse struct {
	Data struct {
		ID                string `json:"id"`
		Status            string `json:"status"`
		Filename          string `json:"filename"`
		SizeBytes         int64  `json:"size_bytes"`
		UploadCompletedAt string `json:"upload_completed_at"`
		R2Key             string `json:"r2_key"`
	} `json:"data"`
}

// APIError represents an error response from the API
type APIError struct {
	Error struct {
		Code    string `json:"code"`
		Message string `json:"message"`
	} `json:"error"`
}

// NewClient creates a new API client
func NewClient(baseURL string) *Client {
	return &Client{
		baseURL: baseURL,
		httpClient: &http.Client{
			Timeout: 30 * time.Minute, // Long timeout for large uploads
		},
	}
}

// Authenticate authenticates FTP credentials and returns a JWT token
func (c *Client) Authenticate(ctx context.Context, req AuthRequest) (*AuthResponse, error) {
	body, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal auth request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, "POST", c.baseURL+"/api/ftp/auth", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("failed to create auth request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("auth request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		var apiErr APIError
		if err := json.NewDecoder(resp.Body).Decode(&apiErr); err != nil {
			return nil, fmt.Errorf("auth failed with status %d", resp.StatusCode)
		}
		return nil, fmt.Errorf("auth failed (%d): %s", resp.StatusCode, apiErr.Error.Message)
	}

	var authResp AuthResponse
	if err := json.NewDecoder(resp.Body).Decode(&authResp); err != nil {
		return nil, fmt.Errorf("failed to decode auth response: %w", err)
	}

	return &authResp, nil
}

// UploadFormData uploads a file via FormData to the API
// Returns: uploadResponse, httpResponse (for status code checking), error
func (c *Client) UploadFormData(ctx context.Context, token, eventID, filename string, reader io.Reader) (*UploadResponse, *http.Response, error) {
	// Create pipe for streaming multipart writer
	pipeReader, pipeWriter := io.Pipe()

	// Create multipart writer
	writer := multipart.NewWriter(pipeWriter)

	// Write FormData fields in background goroutine
	go func() {
		defer pipeWriter.Close()
		defer writer.Close()

		// Write eventId field first
		if err := writer.WriteField("eventId", eventID); err != nil {
			pipeWriter.CloseWithError(fmt.Errorf("failed to write eventId field: %w", err))
			return
		}

		// Write file field
		part, err := writer.CreateFormFile("file", filename)
		if err != nil {
			pipeWriter.CloseWithError(fmt.Errorf("failed to create form file: %w", err))
			return
		}

		// Stream file data from reader to part
		if _, err := io.Copy(part, reader); err != nil {
			pipeWriter.CloseWithError(fmt.Errorf("failed to copy file data: %w", err))
			return
		}
	}()

	// Create HTTP request with streaming body
	httpReq, err := http.NewRequestWithContext(ctx, "POST", c.baseURL+"/api/ftp/upload", pipeReader)
	if err != nil {
		pipeReader.Close()
		return nil, nil, fmt.Errorf("failed to create upload request: %w", err)
	}
	httpReq.Header.Set("Content-Type", writer.FormDataContentType())
	httpReq.Header.Set("Authorization", "Bearer "+token)

	// Execute request
	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return nil, nil, fmt.Errorf("upload request failed: %w", err)
	}

	// Handle non-200 responses
	if resp.StatusCode != 200 {
		// Parse error response
		var apiErr APIError
		if err := json.NewDecoder(resp.Body).Decode(&apiErr); err != nil {
			resp.Body.Close()
			return nil, resp, fmt.Errorf("upload failed with status %d", resp.StatusCode)
		}
		resp.Body.Close()
		return nil, resp, fmt.Errorf("upload failed (%d): %s", resp.StatusCode, apiErr.Error.Message)
	}

	// Parse success response
	var uploadResp UploadResponse
	if err := json.NewDecoder(resp.Body).Decode(&uploadResp); err != nil {
		resp.Body.Close()
		return nil, resp, fmt.Errorf("failed to decode upload response: %w", err)
	}
	resp.Body.Close()

	return &uploadResp, resp, nil
}
