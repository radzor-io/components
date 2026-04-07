# How to integrate @radzor/image-resize

## Overview
Resize, crop, and transform images using raw pixel manipulation. No external dependencies.

## Integration Steps

### TypeScript

1. **No external dependencies required.** This component uses native APIs only.

2. **Create an instance:**
```typescript
import { ImageResize } from "@radzor/image-resize";

const imageResize = new ImageResize({

});
```

3. **Use the component:**
```typescript
const result = await imageResize.resize("example-input", 100);
const result = await imageResize.crop("example-input", 100);
const result = await imageResize.thumbnail("example-input", 100);
```

### Python

```python
from image_resize import ImageResize, ImageResizeConfig
import os

imageResize = ImageResize(ImageResizeConfig(

))
```

## Events

- **onProcessed** — Fired when an image is processed. Payload: `width: number`, `height: number`, `bytes: number`
- **onError** — Fired on error. Payload: `code: string`, `message: string`
