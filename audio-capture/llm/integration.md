# How to integrate @radzor/audio-capture

## Overview
This component captures audio from the user's microphone using the MediaRecorder API. It provides start/stop/pause/resume controls, real-time volume metering, and voice activity detection events.

## Integration Steps

1. **Install**: Copy `src/index.ts` into your project or import from the package.

2. **Create an instance** with optional configuration:
```typescript
import { AudioCapture } from "@radzor/audio-capture";

const capture = new AudioCapture({
  sampleRate: 44100,  // Hz, default: 44100
  channels: 1,        // 1 = mono, 2 = stereo, default: 1
  codec: "opus",      // "opus" | "pcm" | "aac", default: "opus"
});
```

3. **Listen for events** before starting:
```typescript
capture.on("onSpeechStart", ({ timestamp }) => {
  console.log("Speech detected at", timestamp);
});

capture.on("onSpeechEnd", ({ timestamp, duration }) => {
  console.log("Speech ended, duration:", duration, "ms");
});

capture.on("onError", ({ code, message }) => {
  console.error(`Audio error [${code}]: ${message}`);
});
```

4. **Start and stop recording**:
```typescript
await capture.startRecording();

// ... later
const audioBlob = await capture.stopRecording();
```

5. **Use the result**: The returned `Blob` can be uploaded, played back, or piped to a speech-to-text service.

## Constraints
- Requires HTTPS (getUserMedia is blocked on HTTP).
- User must grant microphone permission.
- MediaRecorder codec support varies by browser. `opus` is the safest default.

## Composability
- `audioStream` output is compatible with `@radzor/speech-to-text.input.audioStream` and `@radzor/audio-visualizer.input.audioStream`.
