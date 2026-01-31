package mime

import (
	"fmt"
	"path/filepath"
	"strings"
)

var extensionToMIME = map[string]string{
	".jpg":  "image/jpeg",
	".jpeg": "image/jpeg",
	".png":  "image/png",
	".heic": "image/heic",
	".heif": "image/heif",
	".webp": "image/webp",
}

// FromFilename returns MIME type from filename extension
// Returns error if file extension is not in the whitelist
func FromFilename(filename string) (string, error) {
	ext := strings.ToLower(filepath.Ext(filename))
	if mime, ok := extensionToMIME[ext]; ok {
		return mime, nil
	}
	return "", fmt.Errorf("unsupported file type: %s", ext)
}
