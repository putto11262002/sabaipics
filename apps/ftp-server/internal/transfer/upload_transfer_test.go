package transfer

import "testing"

func TestCategorizeFileType(t *testing.T) {
	tests := []struct {
		ext      string
		expected string
	}{
		// Standard image formats
		{"jpg", "image"},
		{"jpeg", "image"},
		{"png", "image"},
		{"gif", "image"},
		{"webp", "image"},
		{"bmp", "image"},
		{"tiff", "image"},
		{"tif", "image"},

		// RAW camera formats
		{"cr2", "raw"},
		{"cr3", "raw"},
		{"nef", "raw"},
		{"arw", "raw"},
		{"orf", "raw"},
		{"rw2", "raw"},
		{"dng", "raw"},
		{"raf", "raw"},
		{"raw", "raw"},

		// Video formats
		{"mp4", "video"},
		{"mov", "video"},
		{"avi", "video"},
		{"mkv", "video"},

		// Unknown formats
		{"txt", "unknown"},
		{"pdf", "unknown"},
		{"doc", "unknown"},
		{"", "unknown"},
	}

	for _, tt := range tests {
		t.Run(tt.ext, func(t *testing.T) {
			got := categorizeFileType(tt.ext)
			if got != tt.expected {
				t.Errorf("categorizeFileType(%q) = %q, want %q", tt.ext, got, tt.expected)
			}
		})
	}
}
