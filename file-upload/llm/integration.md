# How to integrate @radzor/file-upload

## Overview
Server-side file upload component supporting S3, Cloudflare R2, and local disk storage. Handles MIME type validation, file size limits, and pre-signed URL generation. Zero external dependencies — uses Node.js built-in `crypto` for AWS v4 signing.

## Integration Steps

1. **Import and configure:**
```typescript
import { FileUpload } from "@radzor/file-upload";

// Local storage
const uploader = new FileUpload({
  provider: "local",
  localDir: "./uploads",
  maxSizeBytes: 10 * 1024 * 1024, // 10MB
});

// S3
const s3Uploader = new FileUpload({
  provider: "s3",
  bucket: "my-bucket",
  region: "eu-west-1",
  accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
});

// Cloudflare R2
const r2Uploader = new FileUpload({
  provider: "r2",
  bucket: "my-r2-bucket",
  endpoint: "https://ACCOUNT_ID.r2.cloudflarestorage.com",
  accessKeyId: process.env.R2_ACCESS_KEY_ID!,
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
});
```

2. **Upload a file:**
```typescript
const result = await uploader.upload(buffer, {
  fileName: "photo.jpg",
  mimeType: "image/jpeg",
});
console.log(result.url);  // "/uploads/uuid.jpg" or S3 URL
console.log(result.id);   // UUID
console.log(result.size); // bytes
```

3. **Listen for events:**
```typescript
uploader.on("onProgress", ({ percent }) => {
  console.log(`Upload: ${percent}%`);
});
uploader.on("onComplete", ({ url }) => {
  console.log(`Done: ${url}`);
});
uploader.on("onError", ({ code, message }) => {
  console.error(`${code}: ${message}`);
});
```

4. **Delete a file:**
```typescript
await uploader.delete(result.path);
```

5. **Pre-signed URL for browser upload (S3/R2):**
```typescript
const { url, fields, path } = await s3Uploader.getPresignedUrl(
  "report.pdf",
  "application/pdf",
  3600 // expires in 1 hour
);
// Return url to frontend for direct PUT upload
```

## Environment Variables
- `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` — for S3
- `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` — for Cloudflare R2

## Python Integration

1. **Import and configure:**
```python
import os
from file_upload import FileUpload, FileUploadConfig

# Local storage
uploader = FileUpload(FileUploadConfig(provider="local", local_dir="./uploads"))

# S3
s3_uploader = FileUpload(FileUploadConfig(
    provider="s3",
    bucket="my-bucket",
    region="eu-west-1",
    access_key_id=os.environ["AWS_ACCESS_KEY_ID"],
    secret_access_key=os.environ["AWS_SECRET_ACCESS_KEY"],
))
```

2. **Upload a file:**
```python
with open("photo.jpg", "rb") as f:
    result = uploader.upload(f, file_name="photo.jpg", mime_type="image/jpeg")

print(result.url)   # "/uploads/uuid.jpg" or S3 URL
print(result.size)  # bytes
```

3. **Upload from bytes:**
```python
result = uploader.upload(image_bytes, file_name="avatar.png", mime_type="image/png")
```

4. **Delete a file:**
```python
uploader.delete(result.path)
```

5. **Pre-signed URL (S3/R2):**
```python
presigned = s3_uploader.get_presigned_url("report.pdf", "application/pdf", expires_in=3600)
print(presigned["url"])
```

## Important Constraints
- Node.js only (uses `fs`, `crypto`, `stream` modules)
- Local provider auto-creates directories
- Default max file size: 50MB
- Default allowed MIME types: images, PDF, text, CSV, JSON, ZIP
