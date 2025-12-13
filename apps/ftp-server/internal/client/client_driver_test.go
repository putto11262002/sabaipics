package client

import (
	"os"
	"testing"
)

func TestClientDriver_Open_BlocksDownload(t *testing.T) {
	driver := &ClientDriver{}

	_, err := driver.Open("test.jpg")
	if err != ErrDownloadNotAllowed {
		t.Errorf("Open() error = %v, want ErrDownloadNotAllowed", err)
	}
}

func TestClientDriver_OpenFile_BlocksReadMode(t *testing.T) {
	driver := &ClientDriver{}

	// Read-only mode should be blocked
	_, err := driver.OpenFile("test.jpg", os.O_RDONLY, 0644)
	if err != ErrDownloadNotAllowed {
		t.Errorf("OpenFile(O_RDONLY) error = %v, want ErrDownloadNotAllowed", err)
	}
}

func TestClientDriver_NoOpOperations(t *testing.T) {
	driver := &ClientDriver{}

	// All these operations should succeed (no-op)
	tests := []struct {
		name string
		fn   func() error
	}{
		{"Remove", func() error { return driver.Remove("test.txt") }},
		{"RemoveAll", func() error { return driver.RemoveAll("/tmp") }},
		{"Rename", func() error { return driver.Rename("old.txt", "new.txt") }},
		{"Mkdir", func() error { return driver.Mkdir("testdir", 0755) }},
		{"MkdirAll", func() error { return driver.MkdirAll("/a/b/c", 0755) }},
		{"Chmod", func() error { return driver.Chmod("test.txt", 0644) }},
		{"Chown", func() error { return driver.Chown("test.txt", 1000, 1000) }},
		{"Symlink", func() error { return driver.Symlink("old", "new") }},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if err := tt.fn(); err != nil {
				t.Errorf("%s() unexpected error: %v", tt.name, err)
			}
		})
	}
}

func TestClientDriver_Stat_DirectoryDetection(t *testing.T) {
	driver := &ClientDriver{}

	tests := []struct {
		path    string
		wantDir bool
	}{
		// Directories
		{"/", true},
		{"", true},
		{"/iPhone/", true},
		{"Camera/", true},
		{"/DCIM", true},
		{"/Photos", true},
		{"uploads", true},
		{"somefolder", true}, // No extension = directory

		// Files
		{"/photo.jpg", false},
		{"/image.png", false},
		{"/test.txt", false},
		{"/IMG_0001.CR2", false},
	}

	for _, tt := range tests {
		t.Run(tt.path, func(t *testing.T) {
			info, err := driver.Stat(tt.path)
			if err != nil {
				t.Fatalf("Stat(%q) unexpected error: %v", tt.path, err)
			}
			if info.IsDir() != tt.wantDir {
				t.Errorf("Stat(%q).IsDir() = %v, want %v", tt.path, info.IsDir(), tt.wantDir)
			}
		})
	}
}

func TestClientDriver_ReadDir_ReturnsEmpty(t *testing.T) {
	driver := &ClientDriver{}

	entries, err := driver.ReadDir("/")
	if err != nil {
		t.Fatalf("ReadDir() unexpected error: %v", err)
	}
	if len(entries) != 0 {
		t.Errorf("ReadDir() returned %d entries, want 0", len(entries))
	}
}

func TestClientDriver_Name(t *testing.T) {
	driver := &ClientDriver{}

	if name := driver.Name(); name != "UploadOnlyDriver" {
		t.Errorf("Name() = %q, want %q", name, "UploadOnlyDriver")
	}
}

func TestIsCommonDirectoryName(t *testing.T) {
	tests := []struct {
		path   string
		isDir  bool
	}{
		// Common directory names
		{"/iPhone", true},
		{"Android", true},
		{"Camera", true},
		{"DCIM", true},
		{"Photos", true},
		{"Pictures", true},
		{"uploads", true},
		{"tmp", true},

		// No extension = directory
		{"random", true},
		{"/some/folder", true},

		// Has extension = file
		{"photo.jpg", false},
		{"image.png", false},
		{"video.mp4", false},
	}

	for _, tt := range tests {
		t.Run(tt.path, func(t *testing.T) {
			got := isCommonDirectoryName(tt.path)
			if got != tt.isDir {
				t.Errorf("isCommonDirectoryName(%q) = %v, want %v", tt.path, got, tt.isDir)
			}
		})
	}
}
