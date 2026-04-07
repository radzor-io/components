# How to integrate @radzor/structured-output

## Overview
Force LLM responses to match a JSON schema. Wraps OpenAI and Anthropic with schema-validated generation, automatic retry on parse failure, and TypeScript type inference from the schema.

## Integration Steps

### TypeScript

1. **No external dependencies required.** This component uses native APIs only.

2. **Create an instance:**
```typescript
import { StructuredOutput } from "@radzor/structured-output";

const structuredOutput = new StructuredOutput({
  provider: "openai",
  apiKey: process.env.STRUCTURED_OUTPUT_API_KEY!,
  model: "your-model",
});
```

3. **Use the component:**
```typescript
const result = await structuredOutput.generate("example-prompt", "example-schema");
const result = await structuredOutput.extract("example-text", "example-schema");
const result = await structuredOutput.classify("example-text", "example-labels");
```

## Events

- **onParsed** — Fired when the output is successfully parsed and validated. Payload: `model: string`, `attempts: number`
- **onRetry** — Fired when validation fails and a retry is triggered. Payload: `attempt: number`, `validationError: string`
- **onError** — Fired when all retries are exhausted. Payload: `code: string`, `message: string`, `lastAttempt: string`

## Environment Variables

- `STRUCTURED_OUTPUT_API_KEY`

## Constraints

Uses OpenAI structured outputs (response_format: json_schema) or Anthropic tool use under the hood. Keep schemas flat where possible — nested objects increase failure rate. temperature defaults to 0 for reliability.
