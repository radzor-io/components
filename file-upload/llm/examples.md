# Usage examples for @radzor/file-upload

## Local file upload (Express.js)
```typescript
import express from "express";
import { FileUpload } from "@radzor/file-upload";

const app = express();
const uploader = new FileUpload({ provider: "local", localDir: "./uploads" });

app.post("/upload", async (req, res) => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk);
  const buffer = Buffer.concat(chunks);

  const result = await uploader.upload(buffer, {
    fileName: req.headers["x-filename"] as string ?? "file",
    mimeType: req.headers["content-type"] ?? "application/octet-stream",
  });

  res.json(result);
});
```

## S3 upload with progress
```typescript
import { FileUpload } from "@radzor/file-upload";
import { readFileSync } from "node:fs";

const uploader = new FileUpload({
  provider: "s3",
  bucket: "my-app-assets",
  region: "us-east-1",
  accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  pathPrefix: "user-uploads/",
});

uploader.on("onComplete", ({ url, size }) => {
  console.log(`Uploaded ${size} bytes to ${url}`);
});

const buffer = readFileSync("./photo.jpg");
const result = await uploader.upload(buffer, {
  fileName: "photo.jpg",
  mimeType: "image/jpeg",
});
```

## Pre-signed URL for direct browser upload
```typescript
// Server: generate pre-signed URL
const { url, path } = await uploader.getPresignedUrl("doc.pdf", "application/pdf");

// Client (browser): upload directly to S3
await fetch(url, {
  method: "PUT",
  headers: { "Content-Type": "application/pdf" },
  body: file, // File from input element
});
```

## Custom MIME type restrictions
```typescript
const imageUploader = new FileUpload({
  provider: "local",
  allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
  maxSizeBytes: 5 * 1024 * 1024,
});
```

---

## Python Examples

### Local upload (Flask)
```python
import os
from flask import Flask, request, jsonify
from file_upload import FileUpload, FileUploadConfig

app = Flask(__name__)
uploader = FileUpload(FileUploadConfig(provider="local", local_dir="./uploads"))

@app.route("/upload", methods=["POST"])
def upload():
    file = request.files["file"]
    result = uploader.upload(
        file.stream.read(),
        file_name=file.filename,
        mime_type=file.content_type,
    )
    return jsonify({"url": result.url, "id": result.id, "size": result.size})
```

### S3 upload
```python
from file_upload import FileUpload, FileUploadConfig

uploader = FileUpload(FileUploadConfig(
    provider="s3",
    bucket="my-app-assets",
    region="us-east-1",
    access_key_id=os.environ["AWS_ACCESS_KEY_ID"],
    secret_access_key=os.environ["AWS_SECRET_ACCESS_KEY"],
    path_prefix="user-uploads/",
))

with open("photo.jpg", "rb") as f:
    result = uploader.upload(f, file_name="photo.jpg", mime_type="image/jpeg")
print(f"Uploaded to {result.url}")
```

### FastAPI upload
```python
from fastapi import FastAPI, UploadFile

app = FastAPI()

@app.post("/upload")
async def upload(file: UploadFile):
    data = await file.read()
    result = uploader.upload(data, file_name=file.filename, mime_type=file.content_type)
    return {"url": result.url, "id": result.id}
```

### Error handling
```python
uploader.on("onError", lambda e: print(f"{e['code']}: {e['message']}"))
uploader.on("onComplete", lambda r: print(f"Done: {r.url}"))
```
