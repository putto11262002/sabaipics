package config

import (
	"fmt"
	"os"
	"strconv"

	"github.com/joho/godotenv"
)

// Config holds all application configuration
type Config struct {
	// FTP Server settings
	FTPListenAddress    string
	FTPPassivePortStart int
	FTPPassivePortEnd   int
	FTPIdleTimeout      int  // seconds
	FTPDebug            bool // Enable FTP protocol command/response logging

	// Sentry settings
	SentryDSN         string
	SentryEnvironment string

	// TLS settings (optional)
	TLSCertPath string
	TLSKeyPath  string

	// Implicit FTPS settings (optional)
	ImplicitFTPSEnabled bool   // Enable implicit FTPS server on port 990
	ImplicitFTPSPort    string // Port for implicit FTPS (default: 0.0.0.0:990)

	// API settings - FTP server proxies uploads to this API
	APIURL string // Base URL for SabaiPics API (e.g., https://api.sabaipics.com)
}

// Load reads configuration from environment variables
func Load() (*Config, error) {
	// Try to load .env file (optional, ignore errors)
	_ = godotenv.Load()

	cfg := &Config{
		// FTP Server defaults
		FTPListenAddress:    getEnv("FTP_LISTEN_ADDRESS", "0.0.0.0:2121"),
		FTPPassivePortStart: getEnvInt("FTP_PASSIVE_PORT_START", 5000),
		FTPPassivePortEnd:   getEnvInt("FTP_PASSIVE_PORT_END", 5099),
		FTPIdleTimeout:      getEnvInt("FTP_IDLE_TIMEOUT", 300),
		FTPDebug:            getEnvBool("FTP_DEBUG", false),

		// Sentry
		SentryDSN:         getEnv("SENTRY_DSN", ""),
		SentryEnvironment: getEnv("SENTRY_ENVIRONMENT", "development"),

		// TLS (optional)
		TLSCertPath: getEnv("TLS_CERT_PATH", ""),
		TLSKeyPath:  getEnv("TLS_KEY_PATH", ""),

		// Implicit FTPS (optional)
		ImplicitFTPSEnabled: getEnvBool("IMPLICIT_FTPS_ENABLED", true),
		ImplicitFTPSPort:    getEnv("IMPLICIT_FTPS_PORT", "0.0.0.0:990"),

		// API settings
		APIURL: getEnv("API_URL", ""),
	}

	// Validate required fields
	if cfg.APIURL == "" {
		return nil, fmt.Errorf("API_URL is required")
	}

	return cfg, nil
}

// getEnv retrieves an environment variable or returns a default value
func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

// getEnvInt retrieves an integer environment variable or returns a default value
func getEnvInt(key string, defaultValue int) int {
	if value := os.Getenv(key); value != "" {
		if intVal, err := strconv.Atoi(value); err == nil {
			return intVal
		}
	}
	return defaultValue
}

// getEnvBool retrieves a boolean environment variable or returns a default value
func getEnvBool(key string, defaultValue bool) bool {
	if value := os.Getenv(key); value != "" {
		if boolVal, err := strconv.ParseBool(value); err == nil {
			return boolVal
		}
	}
	return defaultValue
}
