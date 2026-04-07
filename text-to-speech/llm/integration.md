# How to integrate @radzor/text-to-speech

## Overview
Text-to-speech synthesis using OpenAI TTS or ElevenLabs. Produces audio from text with configurable voice, speed, and output format.

## Integration Steps

### TypeScript

1. **No external dependencies required.**

2. **Configure the component**:
```typescript
import { TextToSpeech } from "@radzor/text-to-speech";

const tts = new TextToSpeech({
  provider: "openai",
  apiKey: process.env.OPENAI_API_KEY!,
  voice: "alloy",
  model: "tts-1-hd",
});
```

3. **Synthesize to buffer**:
```typescript
const audio = await tts.synthesize("Hello, welcome to Radzor!");
// audio is a Buffer containing MP3 data
```

4. **Save to file**:
```typescript
await tts.synthesizeToFile("Hello world", "./output.mp3");
```

### Python

No external dependencies.

1. **Configure the component**:
```python
from text_to_speech import TextToSpeech, TextToSpeechConfig
import os

tts = TextToSpeech(TextToSpeechConfig(
    provider="openai",
    api_key=os.environ["OPENAI_API_KEY"],
    voice="alloy",
    model="tts-1-hd",
))
```

2. **Synthesize**:
```python
audio = tts.synthesize("Hello, welcome to Radzor!")
# audio is bytes containing MP3 data
```

3. **Save to file**:
```python
tts.synthesize_to_file("Hello world", "./output.mp3")
```

## Environment Variables Required
- `OPENAI_API_KEY` — For OpenAI TTS
- `ELEVENLABS_API_KEY` — For ElevenLabs

## Constraints
- OpenAI TTS: max 4096 characters per request.
- Server-side only.

## Composability
- Accepts text from `@radzor/llm-completion` output — use `result.content` as the `text` argument to `synthesize()`.
- Output audio buffer can be stored via `@radzor/file-upload`, or sent to the browser as base64/binary for playback via `<audio>` element or Web Audio API.
