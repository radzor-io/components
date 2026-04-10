# How to integrate @radzor/video-transcode

## Overview
This component wraps FFmpeg to transcode video files between formats, extract thumbnails, and retrieve metadata. It spawns FFmpeg as a subprocess, parses progress output in real time, and emits events for progress tracking and completion.

## Integration Steps

1. **Install**: Copy `src/index.ts` into your project or import from the package. Ensure FFmpeg and FFprobe are installed on the system.

2. **Create a transcoder instance**:
```typescript
import { VideoTranscode } from "@radzor/video-transcode";

const transcoder = new VideoTranscode({
  ffmpegPath: "/usr/bin/ffmpeg",  // default: "ffmpeg" (from PATH)
  ffprobePath: "/usr/bin/ffprobe", // default: "ffprobe"
  outputDir: "/tmp/output",
});
```

3. **Transcode a video**:
```typescript
const result = await transcoder.transcode("/input/video.avi", "/output/video.mp4", {
  codec: "libx264",
  audioCodec: "aac",
  resolution: "1920x1080",
  bitrate: "5000k",
  preset: "fast",
});

console.log(result.outputPath, result.duration, result.size);
```

4. **Track progress**:
```typescript
transcoder.on("onProgress", ({ percent, fps, speed }) => {
  console.log(`Progress: ${percent}% | FPS: ${fps} | Speed: ${speed}`);
});

transcoder.on("onTranscodeComplete", ({ inputPath, outputPath }) => {
  console.log(`Done: ${inputPath} → ${outputPath}`);
});

transcoder.on("onTranscodeFailed", ({ inputPath, error }) => {
  console.error(`Failed: ${inputPath} — ${error}`);
});
```

5. **Extract a thumbnail and get metadata**:
```typescript
await transcoder.extractThumbnail("/input/video.mp4", "/output/thumb.jpg", 5.0);

const meta = await transcoder.getMetadata("/input/video.mp4");
console.log(meta.width, meta.height, meta.duration, meta.codec);
```

6. **Python equivalent**:
```python
from video_transcode import VideoTranscode

transcoder = VideoTranscode(ffmpeg_path="ffmpeg")

result = await transcoder.transcode(
    "/input/video.avi", "/output/video.mp4",
    {"codec": "libx264", "preset": "fast"}
)
print(result["output_path"], result["duration"])
```

## Environment Variables Required
None. FFmpeg and FFprobe must be available in the system PATH or provided via config.

## Constraints
- Requires FFmpeg and FFprobe installed on the system.
- Server-only — uses `child_process.spawn` and `child_process.execFile`.
- Large files may take significant time and disk space. Queue jobs externally for high throughput.
- Progress tracking depends on FFmpeg's `-progress pipe:1` output and works best when input duration is known.

## Composability
- Feed `onTranscodeComplete` events into `@radzor/s3-upload` to upload the output.
- Use `@radzor/queue-worker` to manage transcode job queues.
- Combine with `@radzor/notification-hub` to notify users when transcoding finishes.
