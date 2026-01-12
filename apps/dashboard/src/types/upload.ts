export interface UploadQueueItem {
  id: string;
  file: File;
  status: "queued" | "uploading" | "uploaded" | "failed";
  progress?: number;
  error?: string;
  errorStatus?: number;
  photoId?: string; // Set when upload succeeds
}

// Unified log entry - tracks upload from start to finish
export interface UploadLogEntry {
  id: string;
  fileName: string;
  // Local upload status
  uploadStatus: "uploading" | "uploaded" | "failed";
  uploadError?: string;
  // Server photo ID (set once upload succeeds)
  photoId?: string;
  // Timestamp for ordering
  startedAt: number;
}
