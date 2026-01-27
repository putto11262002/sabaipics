package apiclient

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"time"
)

// APIClient defines the interface for API operations (for testing)
type APIClient interface {
	Authenticate(ctx context.Context, req AuthRequest) (*AuthResponse, error)
	Presign(ctx context.Context, token, filename, contentType string) (*PresignResponse, *http.Response, error)
	UploadToPresignedURL(ctx context.Context, putURL string, headers map[string]string, reader io.Reader) (*http.Response, error)
}

// Client is the HTTP client for communicating with the SabaiPics API
type Client struct {
	baseURL    string
	httpClient *http.Client
}

// Ensure Client implements APIClient
var _ APIClient = (*Client)(nil)

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

// PresignRequest represents the presign request payload
type PresignRequest struct {
	Filename    string `json:"filename"`
	ContentType string `json:"content_type"`
	// ContentLength omitted - FTP protocol doesn't guarantee size upfront
}

// PresignResponse represents the presign response from API
type PresignResponse struct {
	UploadID        string            `json:"upload_id"`
	PutURL          string            `json:"put_url"`
	ObjectKey       string            `json:"object_key"`
	ExpiresAt       string            `json:"expires_at"`
	RequiredHeaders map[string]string `json:"required_headers"`
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

	authURL, err := url.JoinPath(c.baseURL, "/api/ftp/auth")
	if err != nil {
		return nil, fmt.Errorf("failed to construct auth URL: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, "POST", authURL, bytes.NewReader(body))
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

// Presign requests a presigned R2 URL for upload
func (c *Client) Presign(ctx context.Context, token, filename, contentType string) (*PresignResponse, *http.Response, error) {
	reqBody := PresignRequest{
		Filename:    filename,
		ContentType: contentType,
	}

	data, err := json.Marshal(reqBody)
	if err != nil {
		return nil, nil, err
	}

	presignURL, err := url.JoinPath(c.baseURL, "/api/ftp/presign")
	if err != nil {
		return nil, nil, fmt.Errorf("failed to construct presign URL: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", presignURL, bytes.NewReader(data))
	if err != nil {
		return nil, nil, err
	}

	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, resp, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusCreated {
		return nil, resp, parseAPIError(resp)
	}

	var result struct {
		Data PresignResponse `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, resp, err
	}

	return &result.Data, resp, nil
}

// UploadToPresignedURL performs HTTP PUT to R2 presigned URL
func (c *Client) UploadToPresignedURL(ctx context.Context, putURL string, headers map[string]string, reader io.Reader) (*http.Response, error) {
	req, err := http.NewRequestWithContext(ctx, "PUT", putURL, reader)
	if err != nil {
		return nil, err
	}

	// Apply required headers from presign response
	for key, value := range headers {
		req.Header.Set(key, value)
	}

	return c.httpClient.Do(req)
}

// parseAPIError parses an error response from the API
func parseAPIError(resp *http.Response) error {
	var apiErr APIError
	if err := json.NewDecoder(resp.Body).Decode(&apiErr); err != nil {
		return fmt.Errorf("API request failed with status %d", resp.StatusCode)
	}
	return fmt.Errorf("API error (%d): %s", resp.StatusCode, apiErr.Error.Message)
}
