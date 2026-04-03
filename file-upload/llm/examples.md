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
  maxSizeBytes: 5 * 1024 * 1024, // 5MB
});

imageUploader.on("onError", ({ code, message }) => {
  if (code === "INVALID_MIME_TYPE") {
    console.error("Only JPEG, PNG, and WebP images allowed");
  }
});
```
