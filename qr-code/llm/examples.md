# @radzor/qr-code — Usage Examples

## QR Code for a URL (SVG inline)

```typescript
import { QrCode } from "@radzor/qr-code";

const qr = new QrCode({ errorCorrection: "M", size: 300 });

const dataUrl = await qr.generateDataUrl("https://example.com/profile/abc123");

// Use in HTML
const html = `<img src="${dataUrl}" alt="QR Code" width="300" height="300">`;
```

## Save QR Code to SVG File

```typescript
import { QrCode } from "@radzor/qr-code";
import * as fs from "fs/promises";

const qr = new QrCode({ errorCorrection: "Q", size: 400, margin: 20 });

await qr.generateToFile("https://myapp.com/invite/xyz", "./public/invite-qr.svg");
console.log("QR saved to ./public/invite-qr.svg");
```

## High-Error-Correction QR for Printed Labels

```typescript
// Use H level when the QR will be on a physical product (may get scratched/dirty)
const qr = new QrCode({
  errorCorrection: "H",
  size: 500,
  margin: 24,
  darkColor: "#1a1a2e",
  lightColor: "#ffffff",
});

const buf = await qr.generate("PRODUCT-SKU-12345-V2", "svg");
await fs.writeFile("./label.svg", buf);
```

## Express API Endpoint

```typescript
import express from "express";
import { QrCode } from "@radzor/qr-code";

const app = express();
const qr = new QrCode({ errorCorrection: "M", size: 300 });

app.get("/qr", async (req, res) => {
  const { data } = req.query;
  if (!data || typeof data !== "string") {
    return res.status(400).json({ error: "Missing ?data= parameter" });
  }

  const buf = await qr.generate(data, "svg");
  res.setHeader("Content-Type", "image/svg+xml");
  res.send(buf);
});
```

## Batch Generation

```typescript
const qr = new QrCode({ errorCorrection: "M", size: 200 });

const items = [
  { id: "A001", url: "https://store.example.com/products/A001" },
  { id: "A002", url: "https://store.example.com/products/A002" },
  { id: "A003", url: "https://store.example.com/products/A003" },
];

const qrCodes = await Promise.all(
  items.map(async ({ id, url }) => ({
    id,
    dataUrl: await qr.generateDataUrl(url),
  }))
);

console.log(`Generated ${qrCodes.length} QR codes`);
```
