# How to integrate @radzor/screenshot

## Overview
Browser screenshot capture using Puppeteer and Chromium. Supports full-page captures, element clipping, and raw HTML rendering. The browser instance is lazily launched and reused across calls for efficiency.

## Integration Steps

1. **Install Puppeteer (includes Chromium):**
```bash
npm install puppeteer
```

2. **Import and configure:**
```typescript
import { Screenshot } from "@radzor/screenshot";

const screenshotter = new Screenshot({
  viewport: { width: 1280, height: 800 },
  format: "png",
  quality: 90,
  waitFor: "networkidle", // wait for network idle before capture
  fullPage: false,
});
```

3. **Capture a URL:**
```typescript
const buffer = await screenshotter.capture("https://example.com");
await fs.writeFile("screenshot.png", buffer);
```

4. **Capture a specific element:**
```typescript
const buffer = await screenshotter.captureElement(
  "https://example.com",
  ".hero-section"
);
```

5. **Render HTML to image:**
```typescript
const html = `<html><body style="background:#f00;padding:20px"><h1>Hello</h1></body></html>`;
const buffer = await screenshotter.captureHtml(html);
```

6. **Listen for events:**
```typescript
screenshotter.on("onCaptured", ({ url, format, bytes }) => {
  console.log(`Captured ${url} as ${format} (${bytes} bytes)`);
});
screenshotter.on("onError", ({ code, message, url }) => {
  console.error(`Screenshot error [${code}] for ${url}: ${message}`);
});
```

7. **Close browser on shutdown:**
```typescript
process.on("SIGTERM", async () => {
  await screenshotter.close();
});
```

## Constraints
- Requires Puppeteer and Chromium — not compatible with edge or serverless runtimes.
- The browser is launched lazily on the first call and reused. Do not call `new Screenshot()` per request.
- `waitFor: "networkidle"` maps to Puppeteer's `networkidle2` (at most 2 active connections for 500ms).
- JPEG quality applies only when `format: "jpeg"`. PNG is always lossless.
- `captureElement()` throws if the selector is not found or the element is not visible.
