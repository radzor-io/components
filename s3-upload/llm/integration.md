# How to integrate @radzor/s3-upload

## Overview
Upload, download, and manage files on S3-compatible storage (AWS S3, MinIO, Cloudflare R2, DigitalOcean Spaces). Implements AWS Signature V4 signing with no SDK dependency — uses raw `fetch()` and Node.js `crypto`.

## Integration Steps

### TypeScript

1. **No external dependencies required.** Uses native `fetch()` and `crypto`.

2. **Create an instance:**
```typescript
import { S3Upload } from "@radzor/s3-upload";

const s3 = new S3Upload({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  region: process.env.AWS_REGION!,
  bucket: "my-bucket",
  // endpoint: "https://s3.us-east-1.amazonaws.com", // optional for non-AWS
});
```

3. **Upload a file:**
```typescript
const result = await s3.upload(
  "images/photo.jpg",
  fileBuffer,
  "image/jpeg",
  { "original-name": "vacation.jpg" } // custom metadata
);
console.log(`Uploaded to ${result.url}, etag: ${result.etag}`);
```

4. **Download a file:**
```typescript
const { body, contentType } = await s3.download("images/photo.jpg");
// body is a Buffer
```

5. **Generate a pre-signed URL:**
```typescript
const url = await s3.getSignedUrl("images/photo.jpg", 3600); // 1 hour
console.log(`Temporary URL: ${url}`);
```

6. **Listen for events:**
```typescript
s3.on("onUploadComplete", (e) => {
  console.log(`Uploaded ${e.key} (${e.size} bytes) to ${e.bucket}`);
});
```

### Python

```python
from s3_upload import S3Upload, S3Config
import os

s3 = S3Upload(S3Config(
    access_key_id=os.environ["AWS_ACCESS_KEY_ID"],
    secret_access_key=os.environ["AWS_SECRET_ACCESS_KEY"],
    region=os.environ["AWS_REGION"],
    bucket="my-bucket",
))

result = s3.upload("images/photo.jpg", file_bytes, "image/jpeg")
print(f"Uploaded: {result.url}")

objects = s3.list_objects(prefix="images/")
```

## Environment Variables Required

| Variable | Description |
|---|---|
| `AWS_ACCESS_KEY_ID` | AWS access key ID |
| `AWS_SECRET_ACCESS_KEY` | AWS secret access key |
| `AWS_REGION` | AWS region (e.g. us-east-1) |

## Constraints

- No external dependencies — AWS Signature V4 is implemented using Node.js `crypto`.
- For non-AWS providers (MinIO, R2, Spaces), set the `endpoint` parameter.
- Object keys should not start with `/`.
- Maximum single PUT upload size is 5GB. Use multipart upload for larger files (not yet supported).
- `listObjects` returns up to 1000 objects per call.
- Pre-signed URLs use `UNSIGNED-PAYLOAD` for GET requests.

## Composability

Upload results (key, URL) can feed into other components that need file references. Connections will be configured in a future pass.
