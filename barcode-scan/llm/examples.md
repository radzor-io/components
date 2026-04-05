# @radzor/barcode-scan — Usage Examples

## Generate a Code128 barcode and save to disk
```typescript
import { BarcodeScanner } from "@radzor/barcode-scan";
import { writeFileSync } from "fs";

const scanner = new BarcodeScanner({ height: 80, includeText: true });
const buf = await scanner.generate("ORDER-20240101-XYZ");
writeFileSync("barcode.svg", buf);
console.log("Saved barcode.svg");
```

## Embed a barcode in an HTML page
```typescript
const scanner = new BarcodeScanner({ width: 300, height: 100 });
const dataUrl = await scanner.generateDataUrl("https://example.com/product/42");

document.querySelector("#barcode-img").setAttribute("src", dataUrl);
```

## EAN-13 product barcode
```typescript
const scanner = new BarcodeScanner({ format: "ean13", width: 250, height: 90 });
// EAN-13: 12 digits (check digit computed or provided as 13th)
const buf = await scanner.generate("590123412345", "ean13");
const svg = buf.toString("utf8");
```

## React component using barcode data URL
```typescript
import { useEffect, useState } from "react";
import { BarcodeScanner } from "@radzor/barcode-scan";

function Barcode({ value }: { value: string }) {
  const [src, setSrc] = useState("");

  useEffect(() => {
    const scanner = new BarcodeScanner({ width: 240, height: 72 });
    scanner.generateDataUrl(value).then(setSrc);
  }, [value]);

  return src ? <img src={src} alt={value} /> : <span>Generating...</span>;
}
```

## Error handling with Code39 validation
```typescript
import { BarcodeScanner, UnsupportedOperationError } from "@radzor/barcode-scan";

const scanner = new BarcodeScanner();

scanner.on("onError", ({ code, message }) => {
  console.error(`[${code}] ${message}`);
});

try {
  // Code39 rejects lowercase — this will throw
  await scanner.generate("hello world", "code39");
} catch (err) {
  console.log("Caught:", (err as Error).message);
}

// Correct: uppercase only
const buf = await scanner.generate("HELLO WORLD", "code39");
```
