# How to integrate @radzor/speech-to-text

## Overview
Audio transcription using OpenAI Whisper or Deepgram. Supports file upload, language detection, word-level timestamps, and multiple output formats.

## Integration Steps

### TypeScript

1. **No external dependencies required.**

2. **Configure the component**:
```typescript
import { SpeechToText } from "@radzor/speech-to-text";

const stt = new SpeechToText({
  provider: "openai",
  apiKey: process.env.OPENAI_API_KEY!,
  model: "whisper-1",
});
```

3. **Transcribe audio**:
```typescript
const result = await stt.transcribe(audioBuffer);
console.log(result.text);
console.log(result.language); // auto-detected
```

4. **With timestamps**:
```typescript
const result = await stt.transcribe(audioBuffer, { timestamps: true });
for (const word of result.words ?? []) {
  console.log(`${word.start}s - ${word.end}s: ${word.word}`);
}
```

### Python

No external dependencies — uses the standard library.

1. **Configure the component**:
```python
from speech_to_text import SpeechToText, SpeechToTextConfig
import os

stt = SpeechToText(SpeechToTextConfig(
    provider="openai",
    api_key=os.environ["OPENAI_API_KEY"],
    model="whisper-1",
))
```

2. **Transcribe from file**:
```python
result = stt.transcribe("/path/to/audio.wav")
print(result.text)
print(result.language)
```

3. **Transcribe from bytes**:
```python
with open("recording.mp3", "rb") as f:
    audio_data = f.read()
result = stt.transcribe(audio_data)
```

## Environment Variables Required
- `OPENAI_API_KEY` — For OpenAI Whisper
- `DEEPGRAM_API_KEY` — For Deepgram

## Constraints
- Server-side only (API keys must not be exposed to the browser).
- OpenAI Whisper: max 25MB file size.
- Supported formats: mp3, wav, m4a, flac, ogg, webm.

## Composability
- Accepts audio from `@radzor/audio-capture` output.
- Transcription text can feed into `@radzor/llm-completion` as context.
