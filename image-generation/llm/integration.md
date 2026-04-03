# How to integrate @radzor/image-generation

## Overview
Multi-provider image generation supporting OpenAI DALL-E, Stability AI, and Replicate. Generate images from text prompts with configurable size, format, and provider-specific options.

## Integration Steps

### TypeScript

1. **No external dependencies required.**

2. **Configure the component**:
```typescript
import { ImageGeneration } from "@radzor/image-generation";

const gen = new ImageGeneration({
  provider: "openai",
  apiKey: process.env.OPENAI_API_KEY!,
  model: "dall-e-3",
  defaultSize: "1024x1024",
  responseFormat: "url",
});
```

3. **Generate an image**:
```typescript
const result = await gen.generate("A serene mountain landscape at sunset");
console.log(result.url);
```

4. **Generate multiple images**:
```typescript
const results = await gen.generateMultiple("Abstract art in blue tones", 3);
results.forEach((r) => console.log(r.url));
```

### Python

No external dependencies — uses only the standard library (`urllib`, `json`).

1. **Configure the component**:
```python
from image_generation import ImageGeneration, ImageGenerationConfig
import os

gen = ImageGeneration(ImageGenerationConfig(
    provider="openai",
    api_key=os.environ["OPENAI_API_KEY"],
    model="dall-e-3",
    default_size="1024x1024",
    response_format="url",
))
```

2. **Generate an image**:
```python
result = gen.generate("A serene mountain landscape at sunset")
print(result.url)
```

3. **Generate multiple images**:
```python
results = gen.generate_multiple("Abstract art in blue tones", 3)
for r in results:
    print(r.url)
```

## Environment Variables Required
- `OPENAI_API_KEY` — For OpenAI DALL-E provider
- `STABILITY_API_KEY` — For Stability AI provider
- `REPLICATE_API_TOKEN` — For Replicate provider

## Constraints
- Each provider has different rate limits and content policies.
- DALL-E 3 may revise your prompt — check `revisedPrompt` in the result.
- Stability AI always returns base64, not URLs.
- Replicate may require polling for results (handled automatically).

## Composability
- `generationResult` can be passed to `@radzor/file-upload` to store generated images.
