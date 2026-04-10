# @radzor/chatbot-flow — Usage Examples

## Customer support chatbot
```typescript
import { ChatbotFlow } from "@radzor/chatbot-flow";

const bot = new ChatbotFlow({
  flow: {
    rootNodeId: "welcome",
    nodes: [
      {
        id: "welcome",
        name: "Welcome",
        message: "Welcome to support! How can I help?",
        options: ["Billing", "Technical Issue", "Account"],
        transitions: [
          { target: "billing", pattern: "billing|payment|charge|invoice" },
          { target: "technical", pattern: "technical|bug|error|broken" },
          { target: "account", pattern: "account|profile|password" },
        ],
      },
      {
        id: "billing",
        name: "Billing",
        message: "I can help with billing. What's your concern?",
        options: ["Refund", "Charge explanation", "Upgrade plan"],
        transitions: [
          { target: "refund", pattern: "refund" },
          { target: "chargeExplain", pattern: "charge|explain" },
          { target: "upgrade", pattern: "upgrade|plan" },
        ],
      },
      {
        id: "refund",
        name: "Refund",
        message: "Please provide your order number and I'll process the refund.",
        transitions: [
          {
            target: "refundConfirm",
            condition: (msg) => /^[A-Z]{2,3}-\d{3,}$/i.test(msg.trim()),
          },
        ],
        action: (ctx, msg) => ({ orderId: msg.trim() }),
      },
      {
        id: "refundConfirm",
        name: "Refund Confirmed",
        message: "Refund initiated for order {{orderId}}. You'll receive a confirmation email.",
        isEnd: true,
      },
      {
        id: "chargeExplain",
        name: "Charge Explanation",
        message: "Your recent charges are from your monthly subscription. Need more details?",
        transitions: [{ target: "welcome", pattern: "*" }],
      },
      {
        id: "upgrade",
        name: "Upgrade",
        message: "Visit app.example.com/billing to upgrade your plan.",
        isEnd: true,
      },
      {
        id: "technical",
        name: "Technical",
        message: "Please describe the issue you're experiencing.",
        transitions: [{ target: "ticketCreated", pattern: "*" }],
        action: (ctx, msg) => ({ issueDescription: msg }),
      },
      {
        id: "ticketCreated",
        name: "Ticket Created",
        message: "I've logged your issue. A technician will follow up via email.",
        isEnd: true,
      },
      {
        id: "account",
        name: "Account",
        message: "For account changes, please visit app.example.com/settings.",
        isEnd: true,
      },
    ],
  },
});

const r1 = bot.start("user-42");
console.log(r1.message); // "Welcome to support!"
console.log(r1.options); // ["Billing", "Technical Issue", "Account"]

const r2 = bot.processMessage("user-42", "billing");
console.log(r2.message); // "I can help with billing..."

const r3 = bot.processMessage("user-42", "refund");
console.log(r3.message); // "Please provide your order number..."

const r4 = bot.processMessage("user-42", "ORD-12345");
console.log(r4.message); // "Refund initiated for order ORD-12345..."
console.log(r4.isComplete); // true
```

## Context variables and interpolation
```typescript
const bot = new ChatbotFlow({
  flow: {
    rootNodeId: "greet",
    nodes: [
      {
        id: "greet",
        name: "Greet",
        message: "Hello {{userName}}! What would you like to do?",
        transitions: [{ target: "end", pattern: "*" }],
      },
      { id: "end", name: "End", message: "Goodbye {{userName}}!", isEnd: true },
    ],
  },
});

const r = bot.start("session-1", { userName: "Alice" });
console.log(r.message); // "Hello Alice! What would you like to do?"
```

## Event monitoring
```typescript
const bot = new ChatbotFlow({ flow: myFlowDefinition });

bot.on("onNodeReached", ({ sessionId, nodeId, nodeName }) => {
  analytics.track("chatbot_node", { sessionId, nodeId, nodeName });
});

bot.on("onFlowComplete", ({ sessionId, context, messageCount }) => {
  console.log(`Session ${sessionId} completed after ${messageCount} messages`);
  analytics.track("chatbot_complete", { sessionId, context });
});

bot.on("onFallback", ({ sessionId, userMessage, currentNode }) => {
  console.warn(`Unmatched input: "${userMessage}" at node ${currentNode}`);
  nlpService.logUnmatched(userMessage);
});
```

## WebSocket integration
```typescript
import { ChatbotFlow } from "@radzor/chatbot-flow";

const bot = new ChatbotFlow({ flow: myFlow });

wss.on("connection", (ws) => {
  const sessionId = generateSessionId();
  const greeting = bot.start(sessionId);
  ws.send(JSON.stringify(greeting));

  ws.on("message", (data) => {
    const { message } = JSON.parse(data.toString());
    const response = bot.processMessage(sessionId, message);
    ws.send(JSON.stringify(response));
  });
});
```

## Session management
```typescript
const bot = new ChatbotFlow({ flow: myFlow });

// Set context externally
bot.setContext("session-1", "plan", "premium");
bot.setContext("session-1", "locale", "en-US");

// Get conversation history
const history = bot.getHistory("session-1");
console.log(`${history.length} messages in conversation`);
for (const msg of history) {
  console.log(`[${msg.role}] ${msg.content}`);
}

// Reset session
const freshStart = bot.reset("session-1");
```

---

## Python Examples

### Basic chatbot
```python
from chatbot_flow import ChatbotFlow

bot = ChatbotFlow(flow={
    "root_node_id": "start",
    "nodes": [
        {
            "id": "start",
            "name": "Start",
            "message": "How can I help?",
            "options": ["Order", "Support"],
            "transitions": [
                {"target": "order", "pattern": "order"},
                {"target": "support", "pattern": "support"},
            ],
        },
        {"id": "order", "name": "Order", "message": "Enter order number:", "transitions": [
            {"target": "done", "pattern": "*"},
        ]},
        {"id": "support", "name": "Support", "message": "Connecting to agent...", "is_end": True},
        {"id": "done", "name": "Done", "message": "Thanks!", "is_end": True},
    ],
})

r = bot.start("session-1")
print(r["message"])  # "How can I help?"

r = bot.process_message("session-1", "order")
print(r["message"])  # "Enter order number:"
```

### Context and history
```python
bot.set_context("session-1", "user_name", "Alice")

history = bot.get_history("session-1")
for msg in history:
    print(f"[{msg['role']}] {msg['content']}")
```
