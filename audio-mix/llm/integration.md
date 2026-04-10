# How to integrate @radzor/audio-mix

## Overview
This component wraps FFmpeg to mix, trim, concatenate, and adjust the volume of audio files. It supports multiple track inputs with per-track volume and timing controls, and emits events on operation completion.

## Integration Steps

1. **Install**: Copy `src/index.ts` into your project or import from the package. Ensure FFmpeg and FFprobe are installed.

2. **Create an audio mixer instance**:
```typescript
import { AudioMix } from "@radzor/audio-mix";

const mixer = new AudioMix({
  ffmpegPath: "ffmpeg",
  ffprobePath: "ffprobe",
  outputDir: "/tmp/audio",
});
```

3. **Mix multiple audio tracks**:
```typescript
const result = await mixer.mix(
  [
    { path: "/audio/vocals.wav", volume: 0.8 },
    { path: "/audio/music.mp3", volume: 0.5, delay: 2000 },
    { path: "/audio/sfx.wav", startTime: 0, endTime: 5 },
  ],
  "/output/final-mix.mp3",
  { sampleRate: 44100, channels: 2, bitrate: "192k" },
);

console.log(result.outputPath, result.duration);
```

4. **Trim an audio file**:
```typescript
const trimmed = await mixer.trim("/audio/interview.mp3", "/output/clip.mp3", 30, 90);
console.log(`Trimmed to ${trimmed.duration}s`);
```

5. **Concatenate files and adjust volume**:
```typescript
const concat = await mixer.concatenate(
  ["/audio/intro.mp3", "/audio/main.mp3", "/audio/outro.mp3"],
  "/output/podcast.mp3",
);

const louder = await mixer.adjustVolume("/audio/quiet.mp3", "/output/loud.mp3", 2.0);
```

6. **Listen for completion events**:
```typescript
mixer.on("onMixComplete", ({ outputPath, duration, trackCount }) => {
  console.log(`Mixed ${trackCount} tracks → ${outputPath} (${duration}s)`);
});
```

7. **Python equivalent**:
```python
from audio_mix import AudioMix

mixer = AudioMix(ffmpeg_path="ffmpeg")

result = await mixer.mix(
    [{"path": "/audio/vocals.wav", "volume": 0.8}],
    "/output/mix.mp3",
)
print(result["output_path"], result["duration"])
```

## Environment Variables Required
None. FFmpeg and FFprobe must be available in the system PATH or provided via config.

## Constraints
- Requires FFmpeg and FFprobe installed on the system.
- Server-only — uses `child_process.spawn`.
- Operations are synchronous per call; use external queuing for high throughput.
- The concatenate action uses FFmpeg's concat demuxer, which works best when all inputs have the same codec and parameters.

## Composability
- Use with `@radzor/s3-upload` to upload mixed audio files.
- Combine with `@radzor/queue-worker` for batch audio processing.
- Feed completion events into `@radzor/notification-hub` for user notifications.
