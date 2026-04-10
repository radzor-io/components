# @radzor/s3-upload — Usage Examples

## Upload a file

```typescript
import { S3Upload } from "@radzor/s3-upload";
import fs from "fs";

const s3 = new S3Upload({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  region: "us-east-1",
  bucket: "my-app-uploads",
});

const fileBuffer = fs.readFileSync("./photo.jpg");
const result = await s3.upload("images/photo.jpg", fileBuffer, "image/jpeg");
console.log(`Uploaded: ${result.url}`);
console.log(`ETag: ${result.etag}`);
```

## Upload with custom metadata

```typescript
const result = await s3.upload(
  "documents/report-2025.pdf",
  pdfBuffer,
  "application/pdf",
  { "uploaded-by": "user-42", "department": "engineering" }
);
```

## Download a file

```typescript
const { body, contentType, etag } = await s3.download("images/photo.jpg");
console.log(`Downloaded ${body.length} bytes, type: ${contentType}`);
fs.writeFileSync("./downloaded.jpg", body);
```

## List objects with prefix

```typescript
const images = await s3.listObjects("images/", 100);
for (const obj of images) {
  console.log(`${obj.key} — ${obj.size} bytes, modified: ${obj.lastModified}`);
}
```

## Generate a pre-signed URL

```typescript
const url = await s3.getSignedUrl("documents/report-2025.pdf", 7200); // 2 hours
console.log(`Share this link: ${url}`);

// Useful for giving temporary access to private files
// The URL works without any authentication headers
```

## Delete an object

```typescript
await s3.delete("temp/scratch-file.txt");
console.log("Deleted successfully");
```

## Use with MinIO (S3-compatible)

```typescript
const minio = new S3Upload({
  accessKeyId: "minioadmin",
  secretAccessKey: "minioadmin",
  region: "us-east-1",
  bucket: "local-bucket",
  endpoint: "http://localhost:9000",
});

await minio.upload("test.txt", "Hello, MinIO!", "text/plain");
const { body } = await minio.download("test.txt");
console.log(body.toString()); // "Hello, MinIO!"
```

## Track uploads with events

```typescript
s3.on("onUploadComplete", ({ key, bucket, size, etag }) => {
  console.log(`[UPLOAD] ${key} → ${bucket} (${size} bytes, etag: ${etag})`);
});

// Upload multiple files
const files = ["a.txt", "b.txt", "c.txt"];
for (const file of files) {
  await s3.upload(`batch/${file}`, `Content of ${file}`, "text/plain");
}
// Each upload triggers onUploadComplete
```

---

## Python Examples

### Upload a file

```python
from s3_upload import S3Upload, S3Config
import os

s3 = S3Upload(S3Config(
    access_key_id=os.environ["AWS_ACCESS_KEY_ID"],
    secret_access_key=os.environ["AWS_SECRET_ACCESS_KEY"],
    region="us-east-1",
    bucket="my-app-uploads",
))

with open("photo.jpg", "rb") as f:
    result = s3.upload("images/photo.jpg", f.read(), "image/jpeg")
    print(f"Uploaded: {result.url}")
```

### Download

```python
result = s3.download("images/photo.jpg")
with open("downloaded.jpg", "wb") as f:
    f.write(result.body)
```

### List objects

```python
objects = s3.list_objects(prefix="images/")
for obj in objects:
    print(f"{obj.key}: {obj.size} bytes")
```

### Pre-signed URL

```python
url = s3.get_signed_url("documents/report.pdf", expires_in=3600)
print(f"Temporary link: {url}")
```
