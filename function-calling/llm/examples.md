# @radzor/function-calling — Usage Examples

## Example 1: Single tool call with OpenAI

```typescript
import { FunctionCalling } from "./components/function-calling/src";

const agent = new FunctionCalling({
  provider: "openai",
  apiKey: process.env.OPENAI_API_KEY!,
  model: "gpt-4o-mini",
});

agent.define([
  {
    name: "get_stock_price",
    description: "Get the current stock price for a ticker symbol",
    schema: {
      type: "object",
      properties: { ticker: { type: "string", description: "Stock ticker, e.g. AAPL" } },
      required: ["ticker"],
    },
    handler: async ({ ticker }) => {
      // call your real stock API here
      return { ticker, price: 182.34, currency: "USD" };
    },
  },
]);

const { response, toolCallLog } = await agent.run("What is Apple's stock price?");
console.log(response);
// "Apple (AAPL) is currently trading at $182.34."
console.log(toolCallLog[0].durationMs);
// 42
```

## Example 2: Multi-tool agentic loop with Anthropic

```typescript
import { FunctionCalling } from "./components/function-calling/src";

const agent = new FunctionCalling({
  provider: "anthropic",
  apiKey: process.env.ANTHROPIC_API_KEY!,
  model: "claude-3-5-sonnet-20241022",
  systemPrompt: "You are a research assistant. Use tools to answer factually.",
  maxIterations: 5,
});

agent.define([
  {
    name: "search_web",
    description: "Search the web for information",
    schema: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
    },
    handler: async ({ query }) => ({ results: [`Result for: ${query}`] }),
  },
  {
    name: "summarize_url",
    description: "Fetch and summarize a URL",
    schema: {
      type: "object",
      properties: { url: { type: "string" } },
      required: ["url"],
    },
    handler: async ({ url }) => ({ summary: `Summary of ${url}` }),
  },
]);

const { response } = await agent.run("Summarize the latest news on quantum computing.");
console.log(response);
```

## Example 3: Observing tool calls with events

```typescript
import { FunctionCalling } from "./components/function-calling/src";

const agent = new FunctionCalling({
  provider: "openai",
  apiKey: process.env.OPENAI_API_KEY!,
  model: "gpt-4o",
});

agent.on("onToolCalled", ({ tool, input }) => {
  console.log(`[TOOL] ${tool} called with`, JSON.stringify(input));
});

agent.on("onToolResult", ({ tool, output, durationMs }) => {
  console.log(`[RESULT] ${tool} returned in ${durationMs}ms:`, output);
});

agent.on("onError", ({ code, message }) => {
  console.error(`[ERROR] ${code}: ${message}`);
});

agent.define([/* your tools */]);
await agent.run("Do something that requires tools.");
```

## Example 4: Multi-turn conversation with history

```typescript
import { FunctionCalling } from "./components/function-calling/src";

const agent = new FunctionCalling({
  provider: "openai",
  apiKey: process.env.OPENAI_API_KEY!,
  model: "gpt-4o",
});

const history: Array<{ role: string; content: string }> = [];

async function chat(userMessage: string) {
  history.push({ role: "user", content: userMessage });
  const { response, toolCallLog } = await agent.runWithHistory([...history]);
  history.push({ role: "assistant", content: response });
  return response;
}

agent.define([/* tools */]);

console.log(await chat("My name is Alice."));
console.log(await chat("What is my name?"));
// "Your name is Alice."
```

## Example 5: Error handling and iteration limit

```typescript
import { FunctionCalling } from "./components/function-calling/src";

const agent = new FunctionCalling({
  provider: "openai",
  apiKey: process.env.OPENAI_API_KEY!,
  model: "gpt-4o",
  maxIterations: 3,
});

agent.on("onError", ({ code, message }) => {
  // log to monitoring
  console.error(`Agent error [${code}]: ${message}`);
});

agent.define([
  {
    name: "unstable_tool",
    description: "A tool that may fail",
    schema: { type: "object", properties: {}, required: [] },
    handler: async () => {
      throw new Error("External service unavailable");
    },
  },
]);

try {
  await agent.run("Use the unstable tool.");
} catch (err: any) {
  console.error("Agent failed:", err.message);
}
```
