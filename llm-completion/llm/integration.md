# How to integrate @radzor/llm-completion

## Overview
Universal LLM client that wraps OpenAI, Anthropic, and Ollama behind a single API. Supports chat completions, streaming, conversation history, and automatic retries with exponential backoff. Zero dependencies — uses native `fetch`.

## Integration Steps

1. **Import and create an instance:**
```typescript
import { LLMCompletion } from "@radzor/llm-completion";

const llm = new LLMCompletion({
  provider: "openai",       // "openai" | "anthropic" | "ollama"
  apiKey: process.env.OPENAI_API_KEY!,
  model: "gpt-4o",
  systemPrompt: "You are a helpful assistant.",
});
```

2. **Get a completion:**
```typescript
const result = await llm.complete("Explain quantum computing in one paragraph.");
console.log(result.content);
console.log(`Tokens used: ${result.usage.totalTokens}`);
```

3. **Stream a response:**
```typescript
llm.on("onChunk", ({ content, done }) => {
  if (!done) process.stdout.write(content);
  else console.log("\n[Stream complete]");
});

await llm.stream("Write a haiku about TypeScript.");
```

4. **Switch providers** by changing the config:
```typescript
// Anthropic
const claude = new LLMCompletion({
  provider: "anthropic",
  apiKey: process.env.ANTHROPIC_API_KEY!,
  model: "claude-sonnet-4-20250514",
});

// Ollama (local, no API key needed)
const local = new LLMCompletion({
  provider: "ollama",
  model: "llama3",
});
```

## Provider-Specific Notes

| Provider | API Key | Default Base URL | Notes |
|----------|---------|-----------------|-------|
| openai | Required | `https://api.openai.com/v1` | Compatible with any OpenAI-compatible API (vLLM, LiteLLM, etc.) via `baseUrl` |
| anthropic | Required | `https://api.anthropic.com/v1` | Uses `x-api-key` header and `anthropic-version: 2023-06-01` |
| ollama | Not needed | `http://localhost:11434` | Requires Ollama running locally |

## Environment Variables
- `OPENAI_API_KEY` — for OpenAI provider
- `ANTHROPIC_API_KEY` — for Anthropic provider

## Important Constraints
- Requires Node.js 18+ or a browser with native `fetch` support
- Ollama must be running locally (or set `baseUrl` to remote instance)
- Retries automatically on 429 (rate limit) and 5xx errors, up to 3 times with exponential backoff
- Does NOT retry on 4xx client errors (except 429)
