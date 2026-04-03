# image-resize — Integration Guide

## Overview

Resize, crop, and create thumbnails from images. Reads PNG, JPEG, and BMP dimensions. Outputs BMP format (zero external dependencies).

## Installation

```bash
radzor add image-resize
```

## Configuration

| Input     | Type   | Required | Description                    |
| --------- | ------ | -------- | ------------------------------ |
| `quality` | number | no       | Output quality 1-100 (default: 80) |

## Quick Start

### TypeScript

```typescript
import { ImageResize } from "./components/image-resize/src";

const img = new ImageResize();
const info = img.getInfo("./photo.jpg");
console.log(`${info.width}x${info.height} ${info.format}`);

img.thumbnail("./photo.jpg", "./thumb.bmp", 200);
```

### Python

```python
from components.image_resize.src import ImageResize

img = ImageResize()
info = img.get_info("./photo.jpg")
print(f"{info.width}x{info.height} {info.format}")

img.thumbnail("./photo.jpg", "./thumb.bmp", 200)
```

## Actions

### getInfo / get_info — Get image dimensions and format
### resize — Resize to specific dimensions (fill, contain, cover)
### crop — Crop a region from an image
### thumbnail — Generate thumbnail preserving aspect ratio

## Requirements

- No external dependencies — uses stdlib only
- Output format is BMP (most universal uncompressed format)
