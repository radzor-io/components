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

## Cross-Environment Bridge (Browser → Server)

`audio-capture` runs in the browser. Components that consume its output (`speech-to-text`, `llm-completion`, `text-to-speech`) run on the server. You **cannot** wire them in the same process.

### Option A: HTTP Upload (simple, higher latency)
```typescript
// Browser — after recording
const blob = await capture.stopRecording();
const form = new FormData();
form.append("audio", blob, "recording.webm");
const res = await fetch("/api/transcribe", { method: "POST", body: form });
const { text } = await res.json();
```

```typescript
// Server — Express/Next.js API route
import { SpeechToText } from "@radzor/speech-to-text";

export async function POST(req: Request) {
  const form = await req.formData();
  const file = form.get("audio") as Blob;
  const buffer = Buffer.from(await file.arrayBuffer());
  const stt = new SpeechToText({ provider: "openai", apiKey: process.env.OPENAI_API_KEY! });
  const result = await stt.transcribe(buffer);
  return Response.json({ text: result.text });
}
```

### Option B: WebSocket (real-time streaming)
```typescript
// Browser
const ws = new WebSocket("wss://yourserver.com/ws/voice");
capture.on("onSpeechEnd", async () => {
  const blob = await capture.stopRecording();
  ws.send(await blob.arrayBuffer());
  await capture.startRecording(); // restart for next utterance
});
ws.onmessage = (e) => {
  const { text, audio } = JSON.parse(e.data);
  // Play audio response in browser
};
```

```typescript
// Server — WebSocket handler
import { SpeechToText } from "@radzor/speech-to-text";
import { LLMCompletion } from "@radzor/llm-completion";
import { TextToSpeech } from "@radzor/text-to-speech";

ws.on("message", async (data: Buffer) => {
  const stt = new SpeechToText({ provider: "openai", apiKey: process.env.OPENAI_API_KEY! });
  const { text } = await stt.transcribe(data);
  const llm = new LLMCompletion({ provider: "openai", apiKey: process.env.OPENAI_API_KEY!, model: "gpt-4o" });
  const reply = await llm.complete(text);
  const tts = new TextToSpeech({ provider: "openai", apiKey: process.env.OPENAI_API_KEY! });
  const audio = await tts.synthesize(reply.content);
  ws.send(JSON.stringify({ text: reply.content, audio: audio.toString("base64") }));
});
```

## Composability
- `audioBlob` output connects to `@radzor/speech-to-text.action.transcribe.audio` (cross-environment — requires HTTP or WebSocket bridge).
- `audioStream` output is compatible with `@radzor/audio-visualizer.input.audioStream` (same environment — browser).
