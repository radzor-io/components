# How to integrate @radzor/chatbot-flow

## Overview
This component lets you build conversational chatbot flows as a graph of nodes connected by transitions. Each node has a message, optional quick-reply options, and transition rules based on pattern matching or custom conditions. It supports context variables, session management, and fallback handling.

## Integration Steps

1. **Install**: Copy `src/index.ts` into your project or import from the package.

2. **Define a flow and create the chatbot**:
```typescript
import { ChatbotFlow } from "@radzor/chatbot-flow";

const bot = new ChatbotFlow({
  flow: {
    rootNodeId: "greeting",
    nodes: [
      {
        id: "greeting",
        name: "Greeting",
        message: "Hello! How can I help you today?",
        options: ["Check order", "Returns", "Talk to agent"],
        transitions: [
          { target: "orderCheck", pattern: "order|check|status" },
          { target: "returns", pattern: "return|refund" },
          { target: "agent", pattern: "agent|human|talk" },
        ],
      },
      {
        id: "orderCheck",
        name: "Order Check",
        message: "Please enter your order number:",
        transitions: [
          {
            target: "orderResult",
            pattern: "*",
            label: "any input",
          },
        ],
        action: (ctx, msg) => ({ orderId: msg.trim() }),
      },
      {
        id: "orderResult",
        name: "Order Result",
        message: "Order {{orderId}} is being processed. Anything else?",
        options: ["Yes", "No"],
        transitions: [
          { target: "greeting", pattern: "yes|yeah" },
          { target: "goodbye", pattern: "no|nope" },
        ],
      },
      {
        id: "returns",
        name: "Returns",
        message: "Our return policy allows returns within 30 days. Need more help?",
        transitions: [{ target: "greeting", pattern: "*" }],
      },
      {
        id: "agent",
        name: "Agent Handoff",
        message: "Connecting you to an agent. Please wait...",
        isEnd: true,
      },
      {
        id: "goodbye",
        name: "Goodbye",
        message: "Thanks for contacting us! Goodbye.",
        isEnd: true,
      },
    ],
  },
  fallbackMessage: "Sorry, I didn't understand. Please choose an option.",
  maxHistory: 50,
});
```

3. **Start a session and process messages**:
```typescript
const response = bot.start("session-123", { userName: "Alice" });
console.log(response.message); // "Hello! How can I help you today?"

const reply = bot.processMessage("session-123", "check my order");
console.log(reply.message); // "Please enter your order number:"

const result = bot.processMessage("session-123", "ORD-456");
console.log(result.message); // "Order ORD-456 is being processed..."
```

4. **Listen for events**:
```typescript
bot.on("onNodeReached", ({ sessionId, nodeName }) => {
  console.log(`Session ${sessionId} reached: ${nodeName}`);
});

bot.on("onFlowComplete", ({ sessionId, context }) => {
  console.log(`Flow complete for ${sessionId}`, context);
});

bot.on("onFallback", ({ sessionId, userMessage }) => {
  console.log(`No match for: "${userMessage}"`);
});
```

5. **Python equivalent**:
```python
from chatbot_flow import ChatbotFlow

bot = ChatbotFlow(flow={
    "root_node_id": "greeting",
    "nodes": [
        {"id": "greeting", "name": "Greeting", "message": "Hello!",
         "transitions": [{"target": "help", "pattern": "*"}]},
        {"id": "help", "name": "Help", "message": "How can I help?", "is_end": True},
    ],
})

response = bot.start("session-1")
print(response["message"])

reply = bot.process_message("session-1", "hi")
print(reply["message"])
```

## Environment Variables Required
None. This component has no external dependencies.

## Constraints
- Sessions are in-memory; data is lost on process restart. Persist externally for production.
- Flow definitions are immutable after construction.
- Pattern matching is case-insensitive and supports pipe-separated alternatives (`yes|yeah|yep`), regex patterns (`/^\d+$/`), and wildcard (`*`).
- Context variables can be interpolated in messages with `{{variableName}}` syntax.

## Composability
- Use with `@radzor/realtime-chat` to handle the WebSocket transport layer.
- Combine with `@radzor/llm-completion` for AI-powered fallback responses.
- Feed `onFlowComplete` events into `@radzor/email-send` for follow-up emails.
