# @radzor/video-transcode — Usage Examples

## Basic format conversion
```typescript
import { VideoTranscode } from "@radzor/video-transcode";

const transcoder = new VideoTranscode();

const result = await transcoder.transcode("/videos/input.avi", "/videos/output.mp4", {
  codec: "libx264",
  audioCodec: "aac",
  preset: "fast",
});

console.log(`Output: ${result.outputPath}`);
console.log(`Duration: ${result.duration}s, Size: ${(result.size / 1024 / 1024).toFixed(1)}MB`);
```

## Transcode with resolution and bitrate control
```typescript
const transcoder = new VideoTranscode();

// Downscale to 720p with controlled bitrate
const result = await transcoder.transcode("/videos/4k-raw.mov", "/videos/720p.mp4", {
  codec: "libx264",
  audioCodec: "aac",
  resolution: "1280x720",
  bitrate: "2500k",
  audioBitrate: "128k",
  preset: "medium",
});

console.log(`${result.codec} @ ${result.format}, ${result.duration}s`);
```

## Progress tracking during transcode
```typescript
const transcoder = new VideoTranscode();

transcoder.on("onProgress", ({ inputPath, percent, fps, speed }) => {
  process.stdout.write(`\r${inputPath}: ${percent}% | ${fps} fps | ${speed}`);
});

transcoder.on("onTranscodeComplete", ({ inputPath, outputPath }) => {
  console.log(`\nDone: ${inputPath} → ${outputPath}`);
});

transcoder.on("onTranscodeFailed", ({ inputPath, error }) => {
  console.error(`\nFailed: ${inputPath} — ${error}`);
});

await transcoder.transcode("/videos/long-video.mkv", "/videos/long-video.mp4", {
  codec: "libx264",
  preset: "slow",
});
```

## Extract a thumbnail at a specific timestamp
```typescript
const transcoder = new VideoTranscode();

// Extract frame at 30 seconds
await transcoder.extractThumbnail("/videos/movie.mp4", "/thumbnails/movie-30s.jpg", 30);

// Extract frame at the start
await transcoder.extractThumbnail("/videos/movie.mp4", "/thumbnails/movie-start.jpg");
```

## Get video metadata
```typescript
const transcoder = new VideoTranscode();

const meta = await transcoder.getMetadata("/videos/sample.mp4");
console.log(`Resolution: ${meta.width}x${meta.height}`);
console.log(`Duration: ${meta.duration}s`);
console.log(`Codec: ${meta.codec} / ${meta.audioCodec}`);
console.log(`Bitrate: ${(meta.bitrate / 1000).toFixed(0)} kbps`);
console.log(`FPS: ${meta.fps}`);
console.log(`Size: ${(meta.size / 1024 / 1024).toFixed(1)} MB`);
```

## WebM conversion for web delivery
```typescript
const transcoder = new VideoTranscode();

const result = await transcoder.transcode("/uploads/raw.mp4", "/web/video.webm", {
  codec: "libvpx-vp9",
  audioCodec: "libopus",
  bitrate: "1500k",
  audioBitrate: "96k",
  extraArgs: ["-deadline", "good", "-cpu-used", "2"],
});
```

---

## Python Examples

### Basic transcode
```python
from video_transcode import VideoTranscode

transcoder = VideoTranscode()

result = await transcoder.transcode(
    "/videos/input.avi", "/videos/output.mp4",
    {"codec": "libx264", "audio_codec": "aac", "preset": "fast"}
)
print(f"Output: {result['output_path']}, Duration: {result['duration']}s")
```

### Get metadata
```python
meta = await transcoder.get_metadata("/videos/sample.mp4")
print(f"{meta['width']}x{meta['height']} | {meta['codec']} | {meta['duration']}s")
```

### Extract thumbnail
```python
await transcoder.extract_thumbnail("/videos/movie.mp4", "/thumbs/frame.jpg", timestamp=10)
```

### Batch transcode
```python
import asyncio

async def batch_transcode(files):
    transcoder = VideoTranscode()
    tasks = [
        transcoder.transcode(f, f.replace(".avi", ".mp4"), {"codec": "libx264"})
        for f in files
    ]
    return await asyncio.gather(*tasks)
```
