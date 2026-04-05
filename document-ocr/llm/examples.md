# @radzor/document-ocr — Usage Examples

## Extract text from a local image (Tesseract)
```typescript
import { DocumentOcr } from "@radzor/document-ocr";
import { readFileSync } from "fs";

const ocr = new DocumentOcr({ provider: "tesseract", language: "eng" });
const buf = readFileSync("receipt.png");

const { text, confidence } = await ocr.extractText(buf);
console.log(`Confidence: ${(confidence * 100).toFixed(1)}%`);
console.log(text);
```

## Extract text with Google Vision from a URL
```typescript
import { DocumentOcr } from "@radzor/document-ocr";

const ocr = new DocumentOcr({ provider: "google-vision", apiKey: process.env.GOOGLE_API_KEY! });

const res = await fetch("https://example.com/invoice.jpg");
const buf = Buffer.from(await res.arrayBuffer());

const result = await ocr.extractText(buf);
console.log(result.pages[0].text);
```

## Extract structured fields from an invoice (Azure)
```typescript
import { DocumentOcr } from "@radzor/document-ocr";
import { readFileSync } from "fs";

const ocr = new DocumentOcr({
  provider: "azure",
  azureEndpoint: process.env.AZURE_ENDPOINT!,
  azureKey: process.env.AZURE_KEY!,
});

const buf = readFileSync("invoice.png");
const { fields, tables } = await ocr.extractStructured(buf);

console.log("Invoice number:", fields["Invoice No"]);
console.log("Total:", fields["Total"]);
console.log("Line items:", tables[0]);
```

## Process uploaded file in Express route
```typescript
import express from "express";
import multer from "multer";
import { DocumentOcr } from "@radzor/document-ocr";

const upload = multer({ storage: multer.memoryStorage() });
const ocr = new DocumentOcr({ provider: "tesseract" });

app.post("/ocr", upload.single("image"), async (req, res) => {
  try {
    const result = await ocr.extractText(req.file!.buffer);
    res.json({ text: result.text, confidence: result.confidence });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});
```

## Handle page-by-page extraction with events
```typescript
import { DocumentOcr } from "@radzor/document-ocr";

const ocr = new DocumentOcr({ provider: "google-vision", apiKey: process.env.GOOGLE_API_KEY! });

ocr.on("onPageExtracted", ({ pageNumber, confidence }) => {
  console.log(`Page ${pageNumber} done (${(confidence * 100).toFixed(0)}% confidence)`);
});

ocr.on("onError", ({ code, message }) => {
  console.error(`[${code}] ${message}`);
});

const { text } = await ocr.extractText(imageBuffer);
```
