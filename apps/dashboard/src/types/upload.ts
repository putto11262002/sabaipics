export interface UploadQueueItem {
  id: string;
  file: File;
  status: "queued" | "uploading" | "uploaded" | "failed";
  progress?: number;
  error?: string;
  errorStatus?: number;
}
