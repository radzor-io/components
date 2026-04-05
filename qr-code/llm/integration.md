# How to integrate @radzor/qr-code

## Overview
Pure TypeScript QR code generator producing SVG output. Implements QR Code Model 2 with byte encoding, Reed-Solomon error correction, and all four error correction levels. Zero npm dependencies. PNG output requires an external rasterizer.

## Integration Steps

1. **Import and configure:**
```typescript
import { QrCode } from "@radzor/qr-code";

const qr = new QrCode({
  errorCorrection: "M", // L | M | Q | H
  size: 300,
  margin: 16,
  darkColor: "#000000",
  lightColor: "#ffffff",
});
```

2. **Generate an SVG buffer:**
```typescript
const svgBuffer = await qr.generate("https://example.com");
// svgBuffer is a Buffer containing UTF-8 SVG markup
```

3. **Generate a data URL for direct HTML embedding:**
```typescript
const dataUrl = await qr.generateDataUrl("https://example.com");
// Use in <img src={dataUrl} /> or CSS background-image
```

4. **Write to a file:**
```typescript
await qr.generateToFile("https://example.com", "./qr.svg");
// For PNG: install sharp and convert the SVG, or pass .png path for annotated SVG
```

5. **Listen for events:**
```typescript
qr.on("onGenerated", ({ format, version }) => {
  console.log(`QR generated: version ${version}, format ${format}`);
});
qr.on("onError", ({ code, message }) => {
  console.error(`QR error [${code}]: ${message}`);
});
```

## Constraints
- Output is SVG. For PNG, convert with `sharp.from(svgBuffer).png().toBuffer()` or equivalent.
- Use `errorCorrection: "H"` for QR codes that may be partially obscured (logos, stickers).
- Maximum input is approximately 271 UTF-8 bytes at version 10 with level M. For larger payloads use a URL shortener.
- `decode()` is not supported in the zero-dependency build — use `@zxing/library` for decoding.
- QR codes generated use mask pattern 0. For applications requiring optimal readability across all decoders, a full mask evaluation pass (patterns 0–7) is recommended.
