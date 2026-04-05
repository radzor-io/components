# How to integrate @radzor/function-calling

## Overview

Implements an agentic tool-calling loop for OpenAI and Anthropic. You define tools with handlers, then call `run()` with a prompt. The component drives the model/tool loop until the model returns a final text response or `maxIterations` is reached.

## Integration Steps

1. Install the component via `radzor add function-calling`.
2. Instantiate `FunctionCalling` with `provider`, `apiKey`, `model`, and optional `systemPrompt` / `maxIterations`.
3. Call `define()` with an array of tool definitions. Each tool needs `name`, `description`, a JSON Schema `schema`, and an async `handler`.
4. Call `run(prompt)` or `runWithHistory(messages)` and await the result.
5. Use the returned `toolCallLog` to inspect every tool invocation and its duration.

```typescript
import { FunctionCalling } from "./components/function-calling/src";

const agent = new FunctionCalling({
  provider: "openai",
  apiKey: process.env.OPENAI_API_KEY!,
  model: "gpt-4o",
  systemPrompt: "You are a helpful assistant.",
  maxIterations: 10,
});

agent.define([
  {
    name: "get_weather",
    description: "Get current weather for a city",
    schema: {
      type: "object",
      properties: { city: { type: "string" } },
      required: ["city"],
    },
    handler: async ({ city }) => ({ temperature: 22, condition: "sunny" }),
  },
]);

const { response, toolCallLog } = await agent.run("What's the weather in Paris?");
```

## Constraints

- `maxIterations` defaults to 10. Exceeding it throws an error — set it higher for complex multi-step tasks.
- Tool `schema` must be valid JSON Schema (draft-07 compatible). Invalid schemas will cause API errors.
- For Anthropic, `tool_use` content blocks are used; for OpenAI, `tool_calls` in the function calling format.
- No external dependencies — uses native `fetch` (Node.js 18+ or browser).
- API keys are never stored beyond the request lifecycle.

## Composability

`runWithHistory()` accepts a full messages array, enabling stateful multi-turn conversations. Combine with a session store to persist history across requests. Chain multiple `FunctionCalling` instances for multi-agent pipelines by passing one agent's response as input to another.
