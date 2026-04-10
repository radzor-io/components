# @radzor/agent-router — Usage Examples

## Basic multi-agent routing
```typescript
import { AgentRouter } from "@radzor/agent-router";

const router = new AgentRouter({
  apiKey: process.env.OPENAI_API_KEY!,
  fallbackAgent: "general",
});

router.registerAgent(
  "coder",
  async (prompt) => `Here's the code: function add(a, b) { return a + b; }`,
  ["code_generation", "debugging"],
  "Handles code-related tasks"
);

router.registerAgent(
  "general",
  async (prompt) => `That's an interesting question! Let me help...`,
  ["general", "chitchat"],
  "Handles general conversation"
);

const result = await router.route("Write a function to add two numbers");
console.log(result.selectedAgent); // "coder"
console.log(result.confidence);    // 0.92
```

## Customer support routing
```typescript
const router = new AgentRouter({
  apiKey: process.env.OPENAI_API_KEY!,
  fallbackAgent: "general-support",
});

router.registerAgent("billing", billingHandler, [
  "billing_inquiry", "refund_request", "payment_issue"
], "Handles billing, payments, and refund questions");

router.registerAgent("technical", techHandler, [
  "bug_report", "feature_request", "technical_help"
], "Handles technical issues and feature requests");

router.registerAgent("account", accountHandler, [
  "account_management", "password_reset", "profile_update"
], "Handles account and profile management");

router.registerAgent("general-support", generalHandler, [
  "general_inquiry", "feedback"
], "Handles everything else");

const result = await router.route("I was charged twice for my subscription");
console.log(result.selectedAgent); // "billing"
console.log(result.intent);       // "billing_inquiry"
```

## Event-driven logging and monitoring
```typescript
const router = new AgentRouter({
  apiKey: process.env.OPENAI_API_KEY!,
});

router.registerAgent("fast", fastHandler, ["simple_question"]);
router.registerAgent("deep", deepHandler, ["complex_analysis", "research"]);

router.on("onRouted", ({ prompt, agent, intent, confidence }) => {
  console.log(`[ROUTE] "${prompt.slice(0, 50)}..." → ${agent} (${intent}, conf=${confidence})`);
  // Send to analytics
});

router.on("onFallback", ({ prompt, agent, reason }) => {
  console.warn(`[FALLBACK] ${reason} → ${agent}`);
  // Alert on too many fallbacks
});

await router.route("What is the meaning of life?");
```

## Dynamic agent management
```typescript
const router = new AgentRouter({
  apiKey: process.env.OPENAI_API_KEY!,
  fallbackAgent: "default",
});

router.registerAgent("default", defaultHandler, ["general"]);

// List agents
console.log(router.listAgents());
// [{ name: "default", intents: ["general"], description: undefined }]

// Add a specialized agent at runtime
router.registerAgent("translator", translationHandler, [
  "translation", "language_detection"
], "Handles translation requests");

const result = await router.route("Translate 'hello' to Japanese");
console.log(result.selectedAgent); // "translator"

// Remove agent when no longer needed
router.removeAgent("translator");
```

## Routing with custom classifier model
```typescript
const router = new AgentRouter({
  apiKey: process.env.OPENAI_API_KEY!,
  classifierModel: "gpt-4o",  // Use a stronger model for better classification
  baseUrl: "https://api.openai.com/v1",
});

router.registerAgent("legal", legalHandler, [
  "contract_review", "compliance", "legal_question"
], "Handles legal and compliance queries");

router.registerAgent("financial", financeHandler, [
  "financial_analysis", "tax_question", "investment_advice"
], "Handles financial and tax questions");

const result = await router.route("Review this NDA for red flags");
console.log(result.selectedAgent); // "legal"
console.log(result.confidence);    // 0.97
```

## Wrapping external LLM calls as agents
```typescript
const router = new AgentRouter({
  apiKey: process.env.OPENAI_API_KEY!,
  fallbackAgent: "openai",
});

// Each agent wraps a different LLM provider
router.registerAgent("openai", async (prompt) => {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({ model: "gpt-4o", messages: [{ role: "user", content: prompt }] }),
  });
  const data = await res.json();
  return data.choices[0].message.content;
}, ["general", "creative_writing"]);

router.registerAgent("anthropic", async (prompt) => {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 2048, messages: [{ role: "user", content: prompt }] }),
  });
  const data = await res.json();
  return data.content[0].text;
}, ["code_generation", "analysis"]);

const result = await router.route("Analyze the time complexity of quicksort");
// Routes to "anthropic" for analysis tasks
```

---

## Python Examples

### Basic routing
```python
import os
from agent_router import AgentRouter, AgentRouterConfig

router = AgentRouter(AgentRouterConfig(
    api_key=os.environ["OPENAI_API_KEY"],
    fallback_agent="general",
))

async def code_handler(prompt: str) -> str:
    return "Here's your code..."

async def general_handler(prompt: str) -> str:
    return "Let me help with that..."

router.register_agent("coder", code_handler, ["code_generation", "debugging"])
router.register_agent("general", general_handler, ["general"])

result = router.route("Write a Python sort function")
print(f"{result.selected_agent}: {result.response}")
```

### Event handling
```python
router.on("onRouted", lambda e: print(f"Routed to {e['agent']}"))
router.on("onFallback", lambda e: print(f"Fallback: {e['reason']}"))

result = router.route("What's the weather like?")
```

### Dynamic agent management
```python
router.register_agent("translator", translate_handler, ["translation"])
print(router.list_agents())

router.remove_agent("translator")
```

### Customer support
```python
router.register_agent("billing", billing_handler, ["billing_inquiry", "refund_request"])
router.register_agent("tech", tech_handler, ["bug_report", "technical_help"])

result = router.route("I need a refund for order #12345")
print(f"Agent: {result.selected_agent}, Intent: {result.intent}")
```
