# @radzor/image-transform — Usage Examples

## 1. Resize an Uploaded Image for Web Display

```typescript
import { ImageTransform } from "@radzor/image-transform";

const transformer = new ImageTransform({
  defaultFormat: "webp",
  quality: 85,
  stripMetadata: true,
});

// In a Next.js API route
const file = (await req.formData()).get("image") as File;
const buffer = Buffer.from(await file.arrayBuffer());

// Resize to max 1200px wide, preserve aspect ratio
const resized = await transformer.resize(buffer, 1200);

// Save or upload the result
await storage.upload(`images/${id}.webp`, resized, { contentType: "image/webp" });
```

## 2. Convert JPEG to AVIF for Maximum Compression

```typescript
import { ImageTransform } from "@radzor/image-transform";

const transformer = new ImageTransform({ quality: 70 });

const jpeg = fs.readFileSync("photo.jpg");

// Convert to AVIF — typically 50-70% smaller than JPEG
const avif = await transformer.convert(jpeg, "avif", 60);

fs.writeFileSync("photo.avif", avif);
console.log(`Original: ${jpeg.length} bytes → AVIF: ${avif.length} bytes`);
```

## 3. Crop a Profile Photo to a Square

```typescript
import { ImageTransform } from "@radzor/image-transform";

const transformer = new ImageTransform({ defaultFormat: "jpeg", quality: 90 });

const image = Buffer.from(await uploadedFile.arrayBuffer());

// First get dimensions to calculate center crop
const meta = await transformer.getMetadata(image);
const size = Math.min(meta.width, meta.height);
const left = Math.floor((meta.width - size) / 2);
const top = Math.floor((meta.height - size) / 2);

// Crop to square, then resize to avatar dimensions
const cropped = await transformer.crop(image, size, size, left, top);
const avatar = await transformer.resize(cropped, 256, 256, "cover");

await db.users.update(userId, { avatarBuffer: avatar });
```

## 4. Add a Watermark to Product Images

```typescript
import { ImageTransform } from "@radzor/image-transform";
import fs from "fs";

const transformer = new ImageTransform({ quality: 85 });

const logo = fs.readFileSync("watermark.png");

transformer.on("onTransformed", ({ format, width, height, sizeBytes }) => {
  console.log(`Watermarked: ${width}x${height} ${format}, ${sizeBytes} bytes`);
});

// Process all product images
for (const product of products) {
  const image = await fetch(product.imageUrl).then((r) => r.arrayBuffer());
  const watermarked = await transformer.watermark(
    Buffer.from(image),
    logo,
    "southeast"
  );
  await storage.upload(`products/${product.id}-wm.webp`, watermarked);
}
```

## 5. Full Upload Pipeline — Resize, Convert, and Store

```typescript
import { ImageTransform } from "@radzor/image-transform";

const transformer = new ImageTransform({
  defaultFormat: "webp",
  quality: 80,
  stripMetadata: true,
  progressive: true,
});

transformer.on("onError", ({ operation, message }) => {
  console.error(`Image transform failed during ${operation}: ${message}`);
});

async function processUpload(fileBuffer: Buffer, id: string) {
  // Generate multiple sizes
  const [thumbnail, medium, large] = await Promise.all([
    transformer.resize(fileBuffer, 150, 150, "cover"),
    transformer.resize(fileBuffer, 600, undefined, "inside"),
    transformer.resize(fileBuffer, 1200, undefined, "inside"),
  ]);

  await Promise.all([
    storage.upload(`${id}/thumb.webp`, thumbnail),
    storage.upload(`${id}/medium.webp`, medium),
    storage.upload(`${id}/large.webp`, large),
  ]);

  const meta = await transformer.getMetadata(large);
  return { id, width: meta.width, height: meta.height };
}
```
