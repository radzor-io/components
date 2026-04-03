# @radzor/text-to-speech — Usage Examples

## TypeScript

### OpenAI TTS basic
```typescript
import { TextToSpeech } from "@radzor/text-to-speech";

const tts = new TextToSpeech({
  provider: "openai",
  apiKey: process.env.OPENAI_API_KEY!,
  voice: "nova",
});

const audio = await tts.synthesize("Welcome to the future of AI.");
fs.writeFileSync("welcome.mp3", audio);
```

### ElevenLabs with custom voice
```typescript
const tts = new TextToSpeech({
  provider: "elevenlabs",
  apiKey: process.env.ELEVENLABS_API_KEY!,
  voice: "pNInz6obpgDQGcFmaJgB", // Adam
  model: "eleven_multilingual_v2",
});

const audio = await tts.synthesize("Bonjour, bienvenue sur Radzor !");
```

### Express audio streaming endpoint
```typescript
app.post("/api/speak", async (req, res) => {
  const { text } = req.body;
  const audio = await tts.synthesize(text, { format: "mp3" });
  res.setHeader("Content-Type", "audio/mpeg");
  res.send(audio);
});
```

### Voice assistant pipeline
```typescript
import { SpeechToText } from "@radzor/speech-to-text";
import { LlmCompletion } from "@radzor/llm-completion";

// audio → text → LLM → speech
const transcript = await stt.transcribe(userAudio);
const reply = await llm.complete(transcript.text);
const audio = await tts.synthesize(reply.content);
```

## Python

### OpenAI TTS basic
```python
from text_to_speech import TextToSpeech, TextToSpeechConfig
import os

tts = TextToSpeech(TextToSpeechConfig(
    provider="openai",
    api_key=os.environ["OPENAI_API_KEY"],
    voice="nova",
))

audio = tts.synthesize("Welcome to the future of AI.")
with open("welcome.mp3", "wb") as f:
    f.write(audio)
```

### Save to file directly
```python
tts.synthesize_to_file("Hello world", "output.mp3")
```

### Flask audio endpoint
```python
from flask import Flask, request, Response

app = Flask(__name__)

@app.route("/api/speak", methods=["POST"])
def speak():
    text = request.json["text"]
    audio = tts.synthesize(text)
    return Response(audio, mimetype="audio/mpeg")
```

### ElevenLabs
```python
tts = TextToSpeech(TextToSpeechConfig(
    provider="elevenlabs",
    api_key=os.environ["ELEVENLABS_API_KEY"],
    voice="pNInz6obpgDQGcFmaJgB",
    model="eleven_multilingual_v2",
))

audio = tts.synthesize("Bonjour, bienvenue sur Radzor !")
```
