# @radzor/screenshot — Usage Examples

## Capture a Public URL

```typescript
import { Screenshot } from "@radzor/screenshot";
import * as fs from "fs/promises";

const screenshotter = new Screenshot({
  viewport: { width: 1440, height: 900 },
  format: "png",
  waitFor: "networkidle",
});

const buf = await screenshotter.capture("https://example.com");
await fs.writeFile("./screenshots/homepage.png", buf);

// Cleanup when done
await screenshotter.close();
```

## Express Screenshot API

```typescript
import express from "express";
import { Screenshot } from "@radzor/screenshot";

const app = express();
// One instance per server — browser is reused across requests
const screenshotter = new Screenshot({ format: "png", waitFor: "load" });

app.get("/screenshot", async (req, res) => {
  const { url } = req.query;
  if (!url || typeof url !== "string") {
    return res.status(400).json({ error: "Missing ?url= parameter" });
  }

  const buf = await screenshotter.capture(url);
  res.setHeader("Content-Type", "image/png");
  res.send(buf);
});

process.on("SIGTERM", () => screenshotter.close());
```

## Capture a Specific Component (Element Screenshot)

```typescript
const screenshotter = new Screenshot({ viewport: { width: 1280, height: 800 } });

// Capture only the navigation bar
const navBuf = await screenshotter.captureElement(
  "https://myapp.com",
  "nav.main-navigation"
);

await fs.writeFile("./nav-screenshot.png", navBuf);
```

## Full-Page Screenshot with JPEG Compression

```typescript
const screenshotter = new Screenshot({
  viewport: { width: 1280, height: 800 },
  fullPage: true,
  format: "jpeg",
  quality: 85,
});

const buf = await screenshotter.capture("https://docs.example.com/guide");
console.log(`Full-page JPEG: ${buf.length} bytes`);
```

## Render Custom HTML to Image

```typescript
const screenshotter = new Screenshot({
  viewport: { width: 800, height: 400 },
  format: "png",
});

const html = `
<!DOCTYPE html>
<html>
<head><style>
  body { font-family: sans-serif; background: #1e1e2e; color: #cdd6f4; padding: 40px; margin: 0; }
  h1 { font-size: 32px; color: #89b4fa; }
  p { color: #a6adc8; }
</style></head>
<body>
  <h1>Monthly Report — April 2026</h1>
  <p>Total revenue: $124,500 (+12% MoM)</p>
</body>
</html>`;

const buf = await screenshotter.captureHtml(html);
await fs.writeFile("./report-card.png", buf);
```
