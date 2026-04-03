# image-resize — Examples

## Get image info

### TypeScript

```typescript
import { ImageResize } from "./components/image-resize/src";

const img = new ImageResize();
const info = img.getInfo("./uploads/photo.png");
console.log(`${info.width}x${info.height}, ${info.format}, ${info.size} bytes`);
```

### Python

```python
from components.image_resize.src import ImageResize

img = ImageResize()
info = img.get_info("./uploads/photo.png")
print(f"{info.width}x{info.height}, {info.format}, {info.size} bytes")
```

## Resize (fill)

### TypeScript

```typescript
img.resize("./photo.jpg", "./resized.bmp", { width: 800, height: 600, fit: "fill" });
```

### Python

```python
from components.image_resize.src import ResizeOptions

img.resize("./photo.jpg", "./resized.bmp", ResizeOptions(width=800, height=600, fit="fill"))
```

## Resize (contain — fit within bounds)

### TypeScript

```typescript
img.resize("./photo.jpg", "./contained.bmp", { width: 800, height: 600, fit: "contain" });
```

### Python

```python
img.resize("./photo.jpg", "./contained.bmp", ResizeOptions(width=800, height=600, fit="contain"))
```

## Crop a region

### TypeScript

```typescript
img.crop("./photo.jpg", "./cropped.bmp", { x: 100, y: 50, width: 400, height: 300 });
```

### Python

```python
from components.image_resize.src import CropOptions

img.crop("./photo.jpg", "./cropped.bmp", CropOptions(x=100, y=50, width=400, height=300))
```

## Generate thumbnail

### TypeScript

```typescript
img.thumbnail("./photo.jpg", "./thumb.bmp", 150);
// Creates a thumbnail that fits within 150x150 while preserving aspect ratio
```

### Python

```python
img.thumbnail("./photo.jpg", "./thumb.bmp", 150)
```

## Event listeners

### TypeScript

```typescript
img.on("onProcessed", (info) => {
  console.log(`${info.operation}: ${info.width}x${info.height}`);
});
img.on("onError", (err) => console.error(err.code, err.message));
```

### Python

```python
img.on("onProcessed", lambda info: print(f"{info['operation']}: {info['width']}x{info['height']}"))
img.on("onError", lambda err: print(err["code"], err["message"]))
```
