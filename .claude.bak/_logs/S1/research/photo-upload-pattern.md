# Large File Upload Pattern - Research

## Executive Summary

**Recommended: Hybrid (Presigned URLs + Worker Validation)**

- Clients upload directly to R2 via presigned URLs
- Worker validates permissions and deducts credits before URL generation
- Queue triggered after confirmation
- Result: Parallel uploads, minimal Worker load

---

## 1. Upload Strategy

### Recommended Flow

```
1. Browser → Worker: POST /api/events/:id/photos/upload-session
   - Validate auth, event, credits
   - Deduct credits
   - Return presigned URLs

2. Browser → R2: PUT (direct, parallel)
   - Upload files with progress tracking

3. Browser → Worker: POST /api/events/:id/photos/confirm-uploads
   - Confirm files exist
   - Enqueue face detection jobs
```

### Why Presigned URLs?

| Factor | Direct Worker | Presigned URLs |
|--------|---------------|----------------|
| Egress cost | ~$20-30/mo for 100 users | $0 (R2 internal) |
| Speed | Sequential | Parallel |
| Progress | Complex | Native |
| Worker CPU | High | Low |

---

## 2. API Design

### Generate Upload Session

```typescript
// POST /api/events/:id/photos/upload-session
interface UploadSessionRequest {
  files: Array<{
    name: string;
    size: number;
    type: string;
  }>;
}

interface UploadSessionResponse {
  sessionId: string;
  photos: Array<{
    photoId: string;
    filename: string;
    uploadUrl: string;
    r2Key: string;
  }>;
  expiresAt: string;
}
```

### Confirm Uploads

```typescript
// POST /api/events/:id/photos/confirm-uploads
interface ConfirmRequest {
  sessionId: string;
  uploadedPhotos: Array<{
    photoId: string;
    r2Key: string;
  }>;
}
```

---

## 3. Presigned URL Generation

```typescript
import { AwsClient } from 'aws4fetch';

async function generatePresignedUrl(
  env: CloudflareBindings,
  key: string
): Promise<string> {
  const aws = new AwsClient({
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  });

  const url = new URL(`https://${env.R2_BUCKET_NAME}.${env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com/${key}`);

  const signed = await aws.sign(
    new Request(url, { method: 'PUT' }),
    { aws: { signQuery: true } }
  );

  return signed.url;
}
```

---

## 4. R2 CORS Configuration

```json
[
  {
    "AllowedOrigins": ["https://app.sabaipics.com", "http://localhost:5173"],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedHeaders": ["Content-Type", "x-amz-meta-*"],
    "MaxAgeSeconds": 3600
  }
]
```

---

## 5. Client Implementation

### React Hook

```typescript
export function usePhotoUpload(eventId: string) {
  const [uploads, setUploads] = useState<UploadFile[]>([]);

  const uploadFiles = async (files: File[]) => {
    // 1. Get presigned URLs
    const session = await api.post(`/events/${eventId}/photos/upload-session`, {
      files: files.map(f => ({ name: f.name, size: f.size, type: f.type }))
    });

    // 2. Upload in parallel (limit 4 concurrent)
    const results = await uploadWithConcurrency(files, session.photos, 4);

    // 3. Confirm uploads
    await api.post(`/events/${eventId}/photos/confirm-uploads`, {
      sessionId: session.sessionId,
      uploadedPhotos: results
    });
  };

  return { uploads, uploadFiles };
}
```

### Concurrent Upload Helper

```typescript
async function uploadWithConcurrency(
  files: File[],
  photoData: PhotoData[],
  limit: number
): Promise<UploadResult[]> {
  const results: UploadResult[] = [];
  const executing: Promise<void>[] = [];

  for (let i = 0; i < files.length; i++) {
    const promise = uploadSingleFile(files[i], photoData[i])
      .then(result => { results.push(result); })
      .finally(() => executing.splice(executing.indexOf(promise), 1));

    executing.push(promise);

    if (executing.length >= limit) {
      await Promise.race(executing);
    }
  }

  await Promise.all(executing);
  return results;
}
```

### XHR with Progress

```typescript
function uploadSingleFile(file: File, data: PhotoData): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        const percent = (e.loaded / e.total) * 100;
        updateProgress(data.photoId, percent);
      }
    };

    xhr.onload = () => {
      if (xhr.status === 200) {
        resolve({ photoId: data.photoId, r2Key: data.r2Key });
      } else {
        reject(new Error(`Upload failed: ${xhr.status}`));
      }
    };

    xhr.onerror = () => reject(new Error('Network error'));
    xhr.open('PUT', data.uploadUrl);
    xhr.setRequestHeader('Content-Type', file.type);
    xhr.send(file);
  });
}
```

---

## 6. Performance

### NFR-3 Target: 100 photos in <5 minutes on 3Mbps

```
5 MB file / 0.375 MB/s = 13.3 seconds per file

100 files serial: 22 minutes
100 files (4 parallel): 5.5 minutes
100 files (6 parallel): 3.7 minutes
```

**Recommendation:** Use 4-6 concurrent uploads.

---

## 7. Queue Integration

### Enqueue After Confirmation

```typescript
async function confirmUploads(sessionId: string, photos: PhotoData[]) {
  // Enqueue all photos for face detection
  for (const photo of photos) {
    await env.PHOTO_QUEUE.send({
      photo_id: photo.photoId,
      event_id: eventId,
      r2_key: photo.r2Key,
    });
  }
}
```

---

## Implementation Checklist

1. [ ] Configure R2 CORS policy
2. [ ] Add R2 credentials to env (for presigning)
3. [ ] Create upload-session endpoint
4. [ ] Create confirm-uploads endpoint
5. [ ] Implement presigned URL generation
6. [ ] Build React upload hook
7. [ ] Add drag-and-drop UI with react-dropzone
8. [ ] Test with 100 files
