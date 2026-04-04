# How to integrate @radzor/image-transform

## Overview
Transform images using Sharp. Resize, convert format, crop, and add watermarks. Chain with @radzor/file-upload.

## Integration Steps

1. **Setup:**
```typescript
import { ImageTransform } from "@radzor/image-transform";
const transformer = new ImageTransform({
  defaultFormat: "webp",
  quality: 85,
  stripMetadata: true,
});
```

2. **Resize an uploaded image:**
```typescript
const resized = await transformer.resize(inputBuffer, 800, 600, "cover");
```

3. **Convert to WebP for web:**
```typescript
const webp = await transformer.convert(inputBuffer, "webp", 80);
```

4. **Full pipeline — upload → resize → convert → store:**
```typescript
// In a Next.js API route
const file = await req.formData().get("image") as File;
const buffer = Buffer.from(await file.arrayBuffer());

const optimized = await transformer.resize(buffer, 1200);
const webp = await transformer.convert(optimized, "webp");

await fileUpload.upload({ file: webp, key: `images/${id}.webp`, mimeType: "image/webp" });
```
