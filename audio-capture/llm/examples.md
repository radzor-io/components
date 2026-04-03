# @radzor/audio-capture — Usage Examples

## Basic recording
```typescript
import { AudioCapture } from "@radzor/audio-capture";

const capture = new AudioCapture();
await capture.startRecording();

// Record for 5 seconds
setTimeout(async () => {
  const blob = await capture.stopRecording();
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  audio.play();
}, 5000);
```

## Voice activity detection
```typescript
const capture = new AudioCapture({ codec: "opus" });

capture.on("onSpeechStart", () => {
  statusEl.textContent = "🎙️ Listening...";
});

capture.on("onSpeechEnd", ({ duration }) => {
  statusEl.textContent = `Segment: ${duration}ms`;
});

await capture.startRecording();
```

## Volume meter
```typescript
const capture = new AudioCapture();
await capture.startRecording();

function updateMeter() {
  const volume = capture.getVolume();
  meterEl.style.width = `${volume * 100}%`;
  requestAnimationFrame(updateMeter);
}
updateMeter();
```

## Pause/Resume
```typescript
const capture = new AudioCapture();
await capture.startRecording();

pauseBtn.onclick = () => capture.pause();
resumeBtn.onclick = () => capture.resume();
stopBtn.onclick = async () => {
  const blob = await capture.stopRecording();
  // upload blob...
};
```

## Upload recorded audio
```typescript
const capture = new AudioCapture({ codec: "opus" });
await capture.startRecording();

// Stop and upload
const blob = await capture.stopRecording();
const form = new FormData();
form.append("audio", blob, "recording.webm");
await fetch("/api/upload", { method: "POST", body: form });
```
