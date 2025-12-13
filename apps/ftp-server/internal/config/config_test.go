package config

import (
	"os"
	"testing"
)

func TestLoad_RequiredFields(t *testing.T) {
	// Clear environment
	originalAPIURL := os.Getenv("API_URL")
	defer os.Setenv("API_URL", originalAPIURL)

	// Test missing API_URL
	os.Unsetenv("API_URL")
	_, err := Load()
	if err == nil {
		t.Error("Load() should fail when API_URL is missing")
	}
}

func TestLoad_Defaults(t *testing.T) {
	// Set required field
	originalAPIURL := os.Getenv("API_URL")
	originalFTPAddr := os.Getenv("FTP_LISTEN_ADDRESS")
	originalPassiveStart := os.Getenv("FTP_PASSIVE_PORT_START")
	originalPassiveEnd := os.Getenv("FTP_PASSIVE_PORT_END")
	originalIdleTimeout := os.Getenv("FTP_IDLE_TIMEOUT")
	originalSentryEnv := os.Getenv("SENTRY_ENVIRONMENT")

	defer func() {
		os.Setenv("API_URL", originalAPIURL)
		os.Setenv("FTP_LISTEN_ADDRESS", originalFTPAddr)
		os.Setenv("FTP_PASSIVE_PORT_START", originalPassiveStart)
		os.Setenv("FTP_PASSIVE_PORT_END", originalPassiveEnd)
		os.Setenv("FTP_IDLE_TIMEOUT", originalIdleTimeout)
		os.Setenv("SENTRY_ENVIRONMENT", originalSentryEnv)
	}()

	os.Setenv("API_URL", "https://api.example.com")
	os.Unsetenv("FTP_LISTEN_ADDRESS")
	os.Unsetenv("FTP_PASSIVE_PORT_START")
	os.Unsetenv("FTP_PASSIVE_PORT_END")
	os.Unsetenv("FTP_IDLE_TIMEOUT")
	os.Unsetenv("SENTRY_ENVIRONMENT")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() unexpected error: %v", err)
	}

	// Check defaults
	if cfg.FTPListenAddress != "0.0.0.0:2121" {
		t.Errorf("FTPListenAddress = %q, want %q", cfg.FTPListenAddress, "0.0.0.0:2121")
	}
	if cfg.FTPPassivePortStart != 5000 {
		t.Errorf("FTPPassivePortStart = %d, want %d", cfg.FTPPassivePortStart, 5000)
	}
	if cfg.FTPPassivePortEnd != 5099 {
		t.Errorf("FTPPassivePortEnd = %d, want %d", cfg.FTPPassivePortEnd, 5099)
	}
	if cfg.FTPIdleTimeout != 300 {
		t.Errorf("FTPIdleTimeout = %d, want %d", cfg.FTPIdleTimeout, 300)
	}
	if cfg.SentryEnvironment != "development" {
		t.Errorf("SentryEnvironment = %q, want %q", cfg.SentryEnvironment, "development")
	}
}

func TestLoad_CustomValues(t *testing.T) {
	// Save and restore original environment
	envVars := []string{
		"API_URL", "FTP_LISTEN_ADDRESS", "FTP_PASSIVE_PORT_START",
		"FTP_PASSIVE_PORT_END", "FTP_IDLE_TIMEOUT", "SENTRY_DSN",
		"SENTRY_ENVIRONMENT", "TLS_CERT_PATH", "TLS_KEY_PATH",
	}
	originals := make(map[string]string)
	for _, key := range envVars {
		originals[key] = os.Getenv(key)
	}
	defer func() {
		for key, val := range originals {
			if val == "" {
				os.Unsetenv(key)
			} else {
				os.Setenv(key, val)
			}
		}
	}()

	// Set custom values
	os.Setenv("API_URL", "https://api.custom.com")
	os.Setenv("FTP_LISTEN_ADDRESS", "127.0.0.1:21")
	os.Setenv("FTP_PASSIVE_PORT_START", "6000")
	os.Setenv("FTP_PASSIVE_PORT_END", "6099")
	os.Setenv("FTP_IDLE_TIMEOUT", "600")
	os.Setenv("SENTRY_DSN", "https://test@sentry.io/123")
	os.Setenv("SENTRY_ENVIRONMENT", "production")
	os.Setenv("TLS_CERT_PATH", "/path/to/cert.pem")
	os.Setenv("TLS_KEY_PATH", "/path/to/key.pem")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() unexpected error: %v", err)
	}

	if cfg.APIURL != "https://api.custom.com" {
		t.Errorf("APIURL = %q, want %q", cfg.APIURL, "https://api.custom.com")
	}
	if cfg.FTPListenAddress != "127.0.0.1:21" {
		t.Errorf("FTPListenAddress = %q, want %q", cfg.FTPListenAddress, "127.0.0.1:21")
	}
	if cfg.FTPPassivePortStart != 6000 {
		t.Errorf("FTPPassivePortStart = %d, want %d", cfg.FTPPassivePortStart, 6000)
	}
	if cfg.FTPPassivePortEnd != 6099 {
		t.Errorf("FTPPassivePortEnd = %d, want %d", cfg.FTPPassivePortEnd, 6099)
	}
	if cfg.FTPIdleTimeout != 600 {
		t.Errorf("FTPIdleTimeout = %d, want %d", cfg.FTPIdleTimeout, 600)
	}
	if cfg.SentryDSN != "https://test@sentry.io/123" {
		t.Errorf("SentryDSN = %q, want %q", cfg.SentryDSN, "https://test@sentry.io/123")
	}
	if cfg.SentryEnvironment != "production" {
		t.Errorf("SentryEnvironment = %q, want %q", cfg.SentryEnvironment, "production")
	}
	if cfg.TLSCertPath != "/path/to/cert.pem" {
		t.Errorf("TLSCertPath = %q, want %q", cfg.TLSCertPath, "/path/to/cert.pem")
	}
	if cfg.TLSKeyPath != "/path/to/key.pem" {
		t.Errorf("TLSKeyPath = %q, want %q", cfg.TLSKeyPath, "/path/to/key.pem")
	}
}
