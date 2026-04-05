# structured-output — Integration Guide

## Overview

Force LLMs (OpenAI and Anthropic) to return validated, typed JSON output matching a schema you define. Uses OpenAI's `response_format: json_schema` for strict mode and Anthropic's tool-use mechanism to guarantee structured responses. Retries automatically on parse or validation failure.

## Installation

```bash
radzor add structured-output
```

## Configuration

| Input        | Type                        | Required | Default | Description                          |
| ------------ | --------------------------- | -------- | ------- | ------------------------------------ |
| `provider`   | `'openai'` \| `'anthropic'` | yes      | —       | LLM provider to use                  |
| `apiKey`     | string                      | yes      | —       | API key for the chosen provider      |
| `model`      | string                      | yes      | —       | Model ID (e.g. `gpt-4o`, `claude-3-5-sonnet-20241022`) |
| `maxRetries` | number                      | no       | `3`     | Retry attempts on parse/schema error |
| `temperature`| number                      | no       | `0`     | Sampling temperature                 |

## Quick Start

```typescript
import { StructuredOutput } from "./components/structured-output/src";

const so = new StructuredOutput({
  provider: "openai",
  apiKey: process.env.OPENAI_API_KEY!,
  model: "gpt-4o",
});

const result = await so.generate(
  "Extract the name and age from: John is 32 years old.",
  {
    type: "object",
    properties: {
      name: { type: "string" },
      age: { type: "number" },
    },
    required: ["name", "age"],
  }
);
// result: { name: "John", age: 32 }
```

## Integration Steps

1. Choose your provider (`openai` or `anthropic`) and obtain an API key.
2. Select a model that supports structured output:
   - OpenAI: `gpt-4o`, `gpt-4o-mini`, `o1` (JSON schema mode)
   - Anthropic: `claude-3-5-sonnet-20241022`, `claude-3-haiku-20240307` (tool use)
3. Define a flat JSON schema with `type: "object"`, `properties`, and `required`.
4. Call `generate()`, `extract()`, or `classify()` — the component handles retries.

## Actions

### generate

Send a prompt and receive a typed response conforming to the given schema. Retries up to `maxRetries` on JSON parse errors or schema validation failures.

**Parameters:** `prompt` (string), `schema` (JsonSchema), `systemPrompt?` (string)
**Returns:** `Promise<T>`

### extract

Extract structured data from an unstructured text string. Wraps the text in an extraction prompt and calls `generate()`.

**Parameters:** `text` (string), `schema` (JsonSchema)
**Returns:** `Promise<T>`

### classify

Classify text into one of the provided labels. Returns the label, confidence (0–1), and reasoning.

**Parameters:** `text` (string), `labels` (string[])
**Returns:** `Promise<{ label, confidence, reasoning }>`

## Events

| Event      | Payload                          | When emitted                           |
| ---------- | -------------------------------- | -------------------------------------- |
| `onParsed` | `{ result, attempt }`            | After a successful parse + validation  |
| `onRetry`  | `{ attempt, error }`             | Before each retry                      |
| `onError`  | `{ code, message }`              | When all retries are exhausted         |

## Constraints

- Keep schemas flat (avoid deep nesting) for best compatibility across providers.
- `temperature` defaults to `0` — increase only when you want varied phrasing.
- OpenAI strict mode requires all schema properties to be listed in `required`.
- Anthropic forces tool use; the model always returns the tool call input as structured data.
- Large schemas with many enum values may reduce accuracy — prefer `classify()` for label tasks.
