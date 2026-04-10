# How to integrate @radzor/agent-router

## Overview
Routes user prompts to specialized AI agents based on intent classification. Uses an LLM to detect the intent of incoming prompts, then dispatches to the appropriate registered agent handler. Supports fallback agents, confidence scoring, and event-driven observability. Zero dependencies — uses native `fetch`.

## Integration Steps

### TypeScript

1. **Import and create a router:**
```typescript
import { AgentRouter } from "@radzor/agent-router";

const router = new AgentRouter({
  apiKey: process.env.OPENAI_API_KEY!,
  classifierModel: "gpt-4o-mini",
  fallbackAgent: "general",
});
```

2. **Register agents with intent handlers:**
```typescript
router.registerAgent(
  "coder",
  async (prompt) => { /* call coding LLM */ return codeResponse; },
  ["code_generation", "debugging", "code_review"],
  "Handles programming and code-related requests"
);

router.registerAgent(
  "writer",
  async (prompt) => { /* call writing LLM */ return writtenContent; },
  ["creative_writing", "summarization", "editing"],
  "Handles creative and professional writing tasks"
);

router.registerAgent(
  "general",
  async (prompt) => { /* call general LLM */ return generalResponse; },
  ["general_question", "chitchat"],
  "Handles general knowledge and conversation"
);
```

3. **Route a prompt:**
```typescript
const result = await router.route("Write a Python function to sort a list");
console.log(result.selectedAgent); // "coder"
console.log(result.intent);       // "code_generation"
console.log(result.confidence);   // 0.95
console.log(result.response);     // The agent's response
```

4. **Listen for routing events:**
```typescript
router.on("onRouted", ({ agent, intent, confidence }) => {
  console.log(`Routed to ${agent} (${intent}, ${confidence})`);
});
router.on("onFallback", ({ agent, reason }) => {
  console.log(`Fallback to ${agent}: ${reason}`);
});
```

### Python

1. **Create and configure:**
```python
import os
from agent_router import AgentRouter, AgentRouterConfig

router = AgentRouter(AgentRouterConfig(
    api_key=os.environ["OPENAI_API_KEY"],
    fallback_agent="general",
))
```

2. **Register agents and route:**
```python
router.register_agent("coder", code_handler, ["code_generation", "debugging"])
router.register_agent("general", general_handler, ["general_question"])

result = router.route("Fix this bug in my Python code")
print(f"Agent: {result.selected_agent}, Intent: {result.intent}")
```

## Environment Variables Required
- `OPENAI_API_KEY` — Used for intent classification

## Constraints
- Requires Node.js 18+ with native `fetch`
- Agent handlers are user-provided async functions — the router does not call LLMs directly for responses
- Intent classification quality depends on the classifier model and clear intent definitions
- All intent matching is case-insensitive

## Composability
Connections to other Radzor components will be defined in a separate pass.
