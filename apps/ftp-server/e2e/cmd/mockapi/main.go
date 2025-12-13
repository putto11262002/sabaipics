// Command mockapi runs a mock SabaiPics API server for E2E testing.
//
// Usage:
//
//	go run ./e2e/cmd/mockapi
//
// The server listens on :8080 and provides:
//   - POST /api/ftp/auth - Authentication (accepts test/pass)
//   - POST /api/ftp/upload - File upload (accepts any file)
package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"sync/atomic"
	"time"
)

var (
	authCount   int64
	uploadCount int64
)

func main() {
	http.HandleFunc("/api/ftp/auth", handleAuth)
	http.HandleFunc("/api/ftp/upload", handleUpload)
	http.HandleFunc("/stats", handleStats)

	addr := ":8080"
	log.Printf("Mock API server starting on %s", addr)
	log.Printf("Auth endpoint: POST /api/ftp/auth")
	log.Printf("Upload endpoint: POST /api/ftp/upload")
	log.Printf("Stats endpoint: GET /stats")
	log.Printf("")
	log.Printf("Valid credentials: username=test, password=pass")

	if err := http.ListenAndServe(addr, nil); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}

func handleAuth(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	atomic.AddInt64(&authCount, 1)
	log.Printf("[AUTH] user=%s pass=%s", req.Username, strings.Repeat("*", len(req.Password)))

	if req.Username == "test" && req.Password == "pass" {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"token":             "test-jwt-token-" + fmt.Sprint(time.Now().Unix()),
			"event_id":          "evt_123",
			"event_name":        "Test Event",
			"upload_window_end": time.Now().Add(24 * time.Hour).Format(time.RFC3339),
			"credits_remaining": 1000,
		})
		log.Printf("[AUTH] SUCCESS for user=%s", req.Username)
	} else {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"error": map[string]string{
				"code":    "INVALID_CREDENTIALS",
				"message": "Invalid username or password",
			},
		})
		log.Printf("[AUTH] FAILED for user=%s", req.Username)
	}
}

func handleUpload(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Check auth
	authHeader := r.Header.Get("Authorization")
	if !strings.HasPrefix(authHeader, "Bearer ") {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"error": map[string]string{
				"code":    "MISSING_AUTH",
				"message": "Missing authorization header",
			},
		})
		log.Printf("[UPLOAD] REJECTED - no auth header")
		return
	}

	// Parse form
	if err := r.ParseMultipartForm(100 * 1024 * 1024); err != nil {
		http.Error(w, "Failed to parse form: "+err.Error(), http.StatusBadRequest)
		return
	}

	eventID := r.FormValue("eventId")
	file, header, err := r.FormFile("file")
	if err != nil {
		http.Error(w, "Missing file: "+err.Error(), http.StatusBadRequest)
		return
	}
	defer file.Close()

	// Read file to count bytes
	data, _ := io.ReadAll(file)
	size := len(data)

	atomic.AddInt64(&uploadCount, 1)
	photoID := fmt.Sprintf("photo_%d", time.Now().UnixNano())

	log.Printf("[UPLOAD] SUCCESS: file=%s size=%d event=%s photo_id=%s",
		header.Filename, size, eventID, photoID)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"data": map[string]interface{}{
			"id":                  photoID,
			"status":              "uploaded",
			"filename":            header.Filename,
			"size_bytes":          size,
			"upload_completed_at": time.Now().Format(time.RFC3339),
			"r2_key":              "events/" + eventID + "/" + header.Filename,
		},
	})
}

func handleStats(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"auth_count":   atomic.LoadInt64(&authCount),
		"upload_count": atomic.LoadInt64(&uploadCount),
	})
}
