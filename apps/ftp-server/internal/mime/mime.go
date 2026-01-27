package mime

import (
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
// Returns "application/octet-stream" if unknown
func FromFilename(filename string) string {
	ext := strings.ToLower(filepath.Ext(filename))
	if mime, ok := extensionToMIME[ext]; ok {
		return mime
	}
	return "application/octet-stream"
}
