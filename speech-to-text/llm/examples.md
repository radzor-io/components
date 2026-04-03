# @radzor/speech-to-text — Usage Examples

## TypeScript

### Basic transcription (Whisper)
```typescript
import { SpeechToText } from "@radzor/speech-to-text";
import fs from "fs";

const stt = new SpeechToText({
  provider: "openai",
  apiKey: process.env.OPENAI_API_KEY!,
});

const audio = fs.readFileSync("meeting.mp3");
const result = await stt.transcribe(audio);
console.log(result.text);
```

### Deepgram with language detection
```typescript
const stt = new SpeechToText({
  provider: "deepgram",
  apiKey: process.env.DEEPGRAM_API_KEY!,
  model: "nova-2",
});

const result = await stt.transcribe(audioBuffer);
console.log(`Detected: ${result.language}`);
console.log(result.text);
```

### Express upload endpoint
```typescript
import multer from "multer";
const upload = multer({ limits: { fileSize: 25 * 1024 * 1024 } });

app.post("/api/transcribe", upload.single("audio"), async (req, res) => {
  const result = await stt.transcribe(req.file!.buffer, {
    timestamps: true,
  });
  res.json({ text: result.text, words: result.words });
});
```

### Pipe audio-capture → speech-to-text
```typescript
import { AudioCapture } from "@radzor/audio-capture";

const recorder = new AudioCapture({ sampleRate: 16000, format: "wav" });
recorder.on("onRecordingComplete", async ({ audioBlob }) => {
  const result = await stt.transcribe(audioBlob);
  console.log("You said:", result.text);
});
```

## Python

### Basic transcription (Whisper)
```python
from speech_to_text import SpeechToText, SpeechToTextConfig
import os

stt = SpeechToText(SpeechToTextConfig(
    provider="openai",
    api_key=os.environ["OPENAI_API_KEY"],
))

result = stt.transcribe("meeting.mp3")
print(result.text)
```

### Deepgram with language detection
```python
stt = SpeechToText(SpeechToTextConfig(
    provider="deepgram",
    api_key=os.environ["DEEPGRAM_API_KEY"],
    model="nova-2",
))

with open("interview.wav", "rb") as f:
    result = stt.transcribe(f.read())

print(f"Detected: {result.language}")
print(result.text)
```

### Flask upload endpoint
```python
from flask import Flask, request, jsonify

app = Flask(__name__)

@app.route("/api/transcribe", methods=["POST"])
def transcribe():
    audio = request.files["audio"].read()
    result = stt.transcribe(audio)
    return jsonify({"text": result.text, "duration": result.duration})
```

### Word-level timestamps
```python
from speech_to_text import TranscribeOptions

result = stt.transcribe("lecture.mp3", TranscribeOptions(timestamps=True))
for word in result.words or []:
    print(f"{word.start:.2f}s - {word.end:.2f}s: {word.word}")
```
