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
	FTPIdleTimeout      int // seconds

	// Database settings
	DatabaseURL string

	// R2/S3 settings (for future use)
	R2AccessKey  string
	R2SecretKey  string
	R2Endpoint   string
	R2BucketName string

	// Sentry settings
	SentryDSN         string
	SentryEnvironment string

	// TLS settings (optional)
	TLSCertPath string
	TLSKeyPath  string
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

		// Database
		DatabaseURL: getEnv("DATABASE_URL", ""),

		// R2/S3
		R2AccessKey:  getEnv("R2_ACCESS_KEY", ""),
		R2SecretKey:  getEnv("R2_SECRET_KEY", ""),
		R2Endpoint:   getEnv("R2_ENDPOINT", ""),
		R2BucketName: getEnv("R2_BUCKET_NAME", ""),

		// Sentry
		SentryDSN:         getEnv("SENTRY_DSN", ""),
		SentryEnvironment: getEnv("SENTRY_ENVIRONMENT", "development"),

		// TLS (optional)
		TLSCertPath: getEnv("TLS_CERT_PATH", ""),
		TLSKeyPath:  getEnv("TLS_KEY_PATH", ""),
	}

	// Validate required fields
	if cfg.DatabaseURL == "" {
		return nil, fmt.Errorf("DATABASE_URL is required")
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
