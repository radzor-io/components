# structured-output — Examples

## Extract structured data from text

```typescript
import { StructuredOutput } from "./components/structured-output/src";

const so = new StructuredOutput({
  provider: "openai",
  apiKey: process.env.OPENAI_API_KEY!,
  model: "gpt-4o",
});

interface Person {
  name: string;
  age: number;
  email: string;
}

const person = await so.extract<Person>(
  "Contact John Smith (42) at john.smith@example.com for details.",
  {
    type: "object",
    properties: {
      name: { type: "string" },
      age: { type: "number" },
      email: { type: "string" },
    },
    required: ["name", "age", "email"],
  }
);

console.log(person); // { name: "John Smith", age: 42, email: "john.smith@example.com" }
```

## Generate structured output with Anthropic

```typescript
import { StructuredOutput } from "./components/structured-output/src";

const so = new StructuredOutput({
  provider: "anthropic",
  apiKey: process.env.ANTHROPIC_API_KEY!,
  model: "claude-3-5-sonnet-20241022",
  temperature: 0,
});

interface ProductReview {
  sentiment: string;
  score: number;
  pros: string[];
  cons: string[];
}

const review = await so.generate<ProductReview>(
  "Review: Great battery life and build quality. Camera is mediocre in low light. Overall happy.",
  {
    type: "object",
    properties: {
      sentiment: { type: "string" },
      score: { type: "number" },
      pros: { type: "array", items: { type: "string" } },
      cons: { type: "array", items: { type: "string" } },
    },
    required: ["sentiment", "score", "pros", "cons"],
  },
  "You are a product review analyst."
);

console.log(review.sentiment); // "positive"
console.log(review.score);     // e.g. 7
```

## Classify text into categories

```typescript
import { StructuredOutput } from "./components/structured-output/src";

const so = new StructuredOutput({
  provider: "openai",
  apiKey: process.env.OPENAI_API_KEY!,
  model: "gpt-4o-mini",
});

const result = await so.classify(
  "My order arrived broken and customer support hasn't responded in 3 days.",
  ["billing", "shipping", "product-defect", "customer-support", "general"]
);

console.log(result.label);      // "customer-support"
console.log(result.confidence); // e.g. 0.91
console.log(result.reasoning);  // "The complaint is about support responsiveness..."
```

## Handle retries and errors

```typescript
import { StructuredOutput } from "./components/structured-output/src";

const so = new StructuredOutput({
  provider: "openai",
  apiKey: process.env.OPENAI_API_KEY!,
  model: "gpt-4o",
  maxRetries: 3,
});

so.on("onRetry", ({ attempt, error }) => {
  console.warn(`Attempt ${attempt} failed: ${error}. Retrying...`);
});

so.on("onParsed", ({ result, attempt }) => {
  console.log(`Parsed on attempt ${attempt}:`, result);
});

so.on("onError", ({ code, message }) => {
  console.error(`[${code}] ${message}`);
});

try {
  const data = await so.generate(
    "List the top 3 programming languages in 2025.",
    {
      type: "object",
      properties: {
        languages: { type: "array", items: { type: "string" } },
      },
      required: ["languages"],
    }
  );
  console.log(data);
} catch (e) {
  // All retries exhausted — handle gracefully
}
```

## Multi-field extraction pipeline

```typescript
import { StructuredOutput } from "./components/structured-output/src";

const so = new StructuredOutput({
  provider: "anthropic",
  apiKey: process.env.ANTHROPIC_API_KEY!,
  model: "claude-3-haiku-20240307",
});

const invoiceText = `
  Invoice #INV-2025-0042
  Date: 2025-03-15
  Bill To: Acme Corp
  Amount Due: $4,820.00
  Due Date: 2025-04-15
`;

interface Invoice {
  invoiceNumber: string;
  date: string;
  billTo: string;
  amountDue: number;
  dueDate: string;
}

const invoice = await so.extract<Invoice>(invoiceText, {
  type: "object",
  properties: {
    invoiceNumber: { type: "string" },
    date: { type: "string" },
    billTo: { type: "string" },
    amountDue: { type: "number" },
    dueDate: { type: "string" },
  },
  required: ["invoiceNumber", "date", "billTo", "amountDue", "dueDate"],
});

console.log(`Invoice ${invoice.invoiceNumber} — $${invoice.amountDue} due ${invoice.dueDate}`);
```
