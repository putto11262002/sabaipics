package client

import "errors"

// Error sentinels for policy violations
// These are returned by ClientDriver without logging - caller decides if/how to log
var (
	ErrDownloadNotAllowed = errors.New("download not allowed - upload only")
	ErrDeleteNotAllowed   = errors.New("delete not allowed - upload only")
	ErrRenameNotAllowed   = errors.New("rename not allowed - upload only")
	ErrMkdirNotAllowed    = errors.New("mkdir not allowed - upload only")
	ErrChmodNotAllowed    = errors.New("chmod not allowed")
	ErrChownNotAllowed    = errors.New("chown not allowed")
	ErrChtimesNotAllowed  = errors.New("chtimes not allowed")
	ErrSymlinkNotAllowed  = errors.New("symlink not supported")
	ErrReadlinkNotAllowed = errors.New("readlink not supported")
	ErrTruncateNotAllowed = errors.New("truncate not supported")
	ErrReaddirNotAllowed  = errors.New("readdir not supported")
)
