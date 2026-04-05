# How to integrate @radzor/document-ocr

## Overview
This component extracts text from images using Tesseract (local CLI), Google Vision, or Azure Computer Vision. Tesseract runs zero-dependency via the system binary; cloud providers use `fetch()`.

## Integration Steps

1. **Install**: Copy `src/index.ts` into your project or import from the package.

2. **Create an instance** choosing a provider:
```typescript
import { DocumentOcr } from "@radzor/document-ocr";

// Local Tesseract (requires `tesseract` on PATH)
const ocr = new DocumentOcr({ provider: "tesseract", language: "eng" });

// Google Vision
const ocr = new DocumentOcr({ provider: "google-vision", apiKey: process.env.GOOGLE_API_KEY });

// Azure
const ocr = new DocumentOcr({
  provider: "azure",
  azureEndpoint: process.env.AZURE_VISION_ENDPOINT,
  azureKey: process.env.AZURE_VISION_KEY,
});
```

3. **Listen for events**:
```typescript
ocr.on("onPageExtracted", ({ pageNumber, text, confidence }) => {
  console.log(`Page ${pageNumber} extracted (confidence: ${confidence})`);
});

ocr.on("onError", ({ code, message }) => {
  console.error(`OCR error [${code}]: ${message}`);
});
```

4. **Extract text**: Pass a `Buffer`, a file path string, or a base64 data URL:
```typescript
import { readFileSync } from "fs";

const buf = readFileSync("invoice.png");
const result = await ocr.extractText(buf);
console.log(result.text);
console.log(result.confidence);
```

5. **Extract structured data** (cloud providers only):
```typescript
const structured = await ocr.extractStructured(buf);
console.log(structured.fields);   // { "Invoice No": "INV-001", "Total": "$42.00" }
console.log(structured.tables);   // [[["Item", "Qty", "Price"], ...]]
console.log(structured.lines);    // raw lines array
```

## Constraints
- Tesseract requires the `tesseract` binary installed (`brew install tesseract` / `apt install tesseract-ocr`).
- `extractStructured()` throws for the `tesseract` provider.
- Input can be a `Buffer`, an absolute file path, or a `data:image/...;base64,...` string.

## Composability
- Pass `extractText()` output to `@radzor/structured-output` for further field parsing.
- Combine with `@radzor/file-upload` — process uploaded images immediately after receipt.
