# Usage examples for @radzor/llm-completion

## Basic completion
```typescript
import { LLMCompletion } from "@radzor/llm-completion";

const llm = new LLMCompletion({
  provider: "openai",
  apiKey: process.env.OPENAI_API_KEY!,
  model: "gpt-4o",
});

const result = await llm.complete("What is the capital of France?");
console.log(result.content); // "The capital of France is Paris."
console.log(result.usage);   // { promptTokens: 14, completionTokens: 8, totalTokens: 22 }
```

## Streaming with real-time output
```typescript
const llm = new LLMCompletion({
  provider: "anthropic",
  apiKey: process.env.ANTHROPIC_API_KEY!,
  model: "claude-sonnet-4-20250514",
  systemPrompt: "You are a creative writer.",
});

llm.on("onChunk", ({ content, done }) => {
  if (!done) process.stdout.write(content);
});

llm.on("onError", ({ code, message, provider }) => {
  console.error(`[${provider}] ${code}: ${message}`);
});

await llm.stream("Write a short story about a robot learning to cook.");
```

## Multi-turn conversation
```typescript
const llm = new LLMCompletion({
  provider: "openai",
  apiKey: process.env.OPENAI_API_KEY!,
  model: "gpt-4o",
  systemPrompt: "You are a math tutor. Be concise.",
});

await llm.complete("What is 2 + 2?");
// "4"

await llm.complete("Multiply that by 3");
// "12" — remembers previous context

console.log(llm.getHistory());
// Full conversation array

llm.clearHistory(); // Reset, keeps system prompt
```

## Local Ollama (no API key)
```typescript
const llm = new LLMCompletion({
  provider: "ollama",
  model: "llama3",
  temperature: 0.3,
});

const result = await llm.complete("Explain Docker in one sentence.");
console.log(result.content);
```

## Error handling
```typescript
const llm = new LLMCompletion({
  provider: "openai",
  apiKey: "invalid-key",
  model: "gpt-4o",
});

llm.on("onError", ({ code, message, provider, status }) => {
  console.error(`${provider} error [${status}]: ${message}`);
});

try {
  await llm.complete("Hello");
} catch (err) {
  // Also throws the error for try/catch handling
}
```

---

## Python Examples

### Basic completion
```python
import os
from llm_completion import LLMCompletion, LLMCompletionConfig

llm = LLMCompletion(LLMCompletionConfig(
    provider="openai",
    api_key=os.environ["OPENAI_API_KEY"],
    model="gpt-4o",
))

result = llm.complete("What is the capital of France?")
print(result.content)  # "The capital of France is Paris."
print(result.usage)    # {"promptTokens": 14, "completionTokens": 8, "totalTokens": 22}
```

### Streaming
```python
llm = LLMCompletion(LLMCompletionConfig(
    provider="anthropic",
    api_key=os.environ["ANTHROPIC_API_KEY"],
    model="claude-sonnet-4-20250514",
    system_prompt="You are a creative writer.",
))

llm.on("onChunk", lambda c: print(c.content, end="", flush=True))
llm.on("onError", lambda e: print(f"[{e.provider}] {e.code}: {e.message}"))

llm.stream("Write a short story about a robot learning to cook.")
```

### Multi-turn conversation
```python
llm = LLMCompletion(LLMCompletionConfig(
    provider="openai",
    api_key=os.environ["OPENAI_API_KEY"],
    model="gpt-4o",
    system_prompt="You are a math tutor. Be concise.",
))

llm.complete("What is 2 + 2?")     # "4"
llm.complete("Multiply that by 3") # "12" — remembers context

print(llm.get_history())
llm.clear_history()  # Reset, keeps system prompt
```

### Local Ollama
```python
llm = LLMCompletion(LLMCompletionConfig(
    provider="ollama", model="llama3", temperature=0.3,
))
result = llm.complete("Explain Docker in one sentence.")
print(result.content)
```
