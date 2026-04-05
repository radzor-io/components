# How to integrate @radzor/barcode-scan

## Overview
This component generates barcodes as SVG buffers or data URLs with zero dependencies. It supports Code128, EAN-13, UPC-A, and Code39. Scanning requires an external library (see Constraints).

## Integration Steps

1. **Install**: Copy `src/index.ts` into your project or import from the package.

2. **Create an instance** with optional configuration:
```typescript
import { BarcodeScanner } from "@radzor/barcode-scan";

const scanner = new BarcodeScanner({
  format: "code128",   // "code128" | "ean13" | "upca" | "code39", default: "code128"
  width: 200,          // SVG width in px, default: 200
  height: 80,          // Bar height in px, default: 80
  includeText: true,   // Render data string below bars, default: true
});
```

3. **Listen for events** before generating:
```typescript
scanner.on("onGenerated", ({ data, format, bytes }) => {
  console.log(`Generated ${format} barcode for "${data}" (${bytes} bytes)`);
});

scanner.on("onError", ({ code, message }) => {
  console.error(`Barcode error [${code}]: ${message}`);
});
```

4. **Generate a barcode**:
```typescript
// Returns a Buffer containing SVG markup
const buf = await scanner.generate("HELLO-123", "code128");
const svg = buf.toString("utf8");

// Or get a data URL for direct use in <img> tags
const dataUrl = await scanner.generateDataUrl("HELLO-123");
```

5. **Use the result**: Embed the SVG string in HTML, write it to disk, or pass the Buffer to a PDF generator.

## Constraints
- `generate()` produces SVG output. PNG output throws `UnsupportedOperationError`; add `sharp` or `canvas` to convert.
- EAN-13 requires 12–13 digits. UPC-A requires exactly 12 digits. Code39 requires uppercase alphanumeric + `- . $ / + % space`.
- `scan()` always throws `UnsupportedOperationError`. For scanning, use `@zxing/library` (browser) or `zxing-wasm` (Node.js).

## Composability
- SVG buffer output is compatible with `@radzor/pdf-generate.input.assets` for embedding barcodes in PDFs.
- `generateDataUrl()` output can be set directly as `src` on an `<img>` element.
