package config

import (
	"fmt"
	"os"
	"strings"
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

	// TLS settings (optional)
	TLSCertPath string
	TLSKeyPath  string

	// Implicit FTPS settings (optional)
	ImplicitFTPSEnabled bool   // Enable implicit FTPS server on port 990
	ImplicitFTPSPort    string // Port for implicit FTPS (default: 0.0.0.0:990)

	// API settings - FTP server proxies uploads to this API
	APIURL string // Base URL for SabaiPics API (e.g., https://api.sabaipics.com)

	// Environment label for observability
	Environment string

	// Grafana OTLP tracing
	GrafanaOTLPTracesURL string
	OTLPTracesUser       string
	OTLPTracesToken      string
	OTELTraceSampleRatio float64

	// Grafana OTLP metrics
	GrafanaOTLPMetricsURL string
	OTLPMetricsUser       string
	OTLPMetricsToken      string

	// Grafana Loki logs
	GrafanaLokiURL string
	LokiUser       string
	LokiToken      string
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

		// TLS (optional)
		TLSCertPath: getEnv("TLS_CERT_PATH", ""),
		TLSKeyPath:  getEnv("TLS_KEY_PATH", ""),

		// Implicit FTPS (optional)
		ImplicitFTPSEnabled: getEnvBool("IMPLICIT_FTPS_ENABLED", true),
		ImplicitFTPSPort:    getEnv("IMPLICIT_FTPS_PORT", "0.0.0.0:990"),

		// API settings
		APIURL: getEnv("API_URL", ""),

		// Observability
		Environment: getEnv("NODE_ENV", "development"),

		GrafanaOTLPTracesURL: getEnv("GRAFANA_OTLP_TRACES_URL", ""),
		OTLPTracesUser:       getEnv("OTLP_TRACES_USER", ""),
		OTLPTracesToken:      getEnv("OTLP_TRACES_TOKEN", ""),
		OTELTraceSampleRatio: getEnvFloat(
			"OTEL_TRACE_SAMPLE_RATIO",
			defaultTraceSampleRatio(getEnv("NODE_ENV", "development")),
		),

		GrafanaOTLPMetricsURL: getEnv("GRAFANA_OTLP_METRICS_URL", ""),
		OTLPMetricsUser:       getEnv("OTLP_METRICS_USER", ""),
		OTLPMetricsToken:      getEnv("OTLP_METRICS_TOKEN", ""),

		GrafanaLokiURL: getEnv("GRAFANA_LOKI_URL", ""),
		LokiUser:       getEnv("LOKI_USER", ""),
		LokiToken:      getEnv("LOKI_TOKEN", ""),
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

func getEnvFloat(key string, defaultValue float64) float64 {
	if value := strings.TrimSpace(os.Getenv(key)); value != "" {
		if floatVal, err := strconv.ParseFloat(value, 64); err == nil {
			if floatVal < 0 {
				return 0
			}
			if floatVal > 1 {
				return 1
			}
			return floatVal
		}
	}
	return defaultValue
}

func defaultTraceSampleRatio(env string) float64 {
	switch strings.ToLower(strings.TrimSpace(env)) {
	case "development", "dev", "local":
		return 1
	case "staging":
		return 0.6
	default:
		return 0.5
	}
}
