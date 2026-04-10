# @radzor/prompt-template — Usage Examples

## Basic variable interpolation
```typescript
import { PromptTemplate } from "@radzor/prompt-template";

const pt = new PromptTemplate();

pt.register("greet", "Hello, {{name}}! You are a {{role}}.");

const result = pt.render("greet", { name: "Alice", role: "developer" });
console.log(result.text);
// "Hello, Alice! You are a developer."
console.log(result.variablesUsed); // ["name", "role"]
```

## Few-shot example injection
```typescript
const pt = new PromptTemplate();

pt.register("sentiment", `
Classify the sentiment of the text as positive, negative, or neutral.

{{examples}}

Text: "{{text}}"
Sentiment:
`);

const result = pt.render("sentiment", {
  text: "This product exceeded my expectations!",
}, [
  { input: "I love this!", output: "positive" },
  { input: "Terrible experience.", output: "negative" },
  { input: "It was okay.", output: "neutral" },
]);

console.log(result.text);
// Includes formatted examples and the target text
console.log(result.exampleCount); // 3
```

## Conditional sections
```typescript
const pt = new PromptTemplate();

pt.register("assistant", `
You are a helpful assistant.
{{#if persona}}Your persona: {{persona}}{{/if}}
{{#if context}}Reference context: {{context}}{{/if}}

User: {{question}}
`);

// With persona and context
const r1 = pt.render("assistant", {
  question: "What is TypeScript?",
  persona: "Senior engineer",
  context: "Programming languages documentation",
});
// Persona and context sections are included

// Without optional sections
const r2 = pt.render("assistant", { question: "What is TypeScript?" });
// Persona and context sections are omitted
```

## Template defaults
```typescript
const pt = new PromptTemplate();

pt.register("translate", "Translate from {{source}} to {{target}}: {{text}}", {
  source: "English",
  target: "French",
});

// Uses defaults for source and target
const r1 = pt.render("translate", { text: "Hello, world!" });
console.log(r1.text); // "Translate from English to French: Hello, world!"

// Override defaults
const r2 = pt.render("translate", { text: "Hello!", target: "Spanish" });
console.log(r2.text); // "Translate from English to Spanish: Hello!"
```

## Template validation
```typescript
const pt = new PromptTemplate({ strictMode: true });

pt.register("email", "Subject: {{subject}}\nTo: {{recipient}}\n\n{{body}}");

// Check what's missing
const v1 = pt.validate("email", { subject: "Test" });
console.log(v1.valid);               // false
console.log(v1.unresolvedVariables);  // ["recipient", "body"]
console.log(v1.errors);              // ["Unresolved variables: recipient, body"]

// All provided
const v2 = pt.validate("email", { subject: "Hi", recipient: "bob@x.com", body: "Hello" });
console.log(v2.valid); // true
```

## Listing registered templates
```typescript
const pt = new PromptTemplate();

pt.register("qa", "Q: {{question}}\nA:");
pt.register("summarize", "Summarize:\n{{text}}\n\nSummary:", { text: "" });

const templates = pt.list();
for (const t of templates) {
  console.log(`${t.name}: vars=[${t.variables}], hasExamples=${t.hasExamplesSlot}, chars=${t.charLength}`);
}
// qa: vars=[question], hasExamples=false, chars=20
// summarize: vars=[text], hasExamples=false, chars=32
```

---

## Python Examples

### Basic rendering
```python
from prompt_template import PromptTemplate

pt = PromptTemplate()
pt.register("greet", "Hello, {{name}}! You are a {{role}}.")

result = pt.render("greet", {"name": "Alice", "role": "developer"})
print(result.text)  # "Hello, Alice! You are a developer."
```

### Few-shot examples
```python
pt.register("sentiment", """
Classify the sentiment.
{{examples}}
Text: "{{text}}"
Sentiment:
""")

result = pt.render("sentiment", {"text": "Great product!"}, examples=[
    {"input": "Love it!", "output": "positive"},
    {"input": "Awful.", "output": "negative"},
])
print(result.text)
print(f"Examples injected: {result.example_count}")
```

### Conditionals and defaults
```python
pt.register("assistant", """
You are a {{role}}.
{{#if context}}Context: {{context}}{{/if}}
User: {{question}}
""", defaults={"role": "helpful assistant"})

result = pt.render("assistant", {"question": "What is Python?"})
print(result.text)
```

### Validation
```python
v = pt.validate("assistant", {"question": "Hello"})
print(f"Valid: {v.valid}")
print(f"Unresolved: {v.unresolved_variables}")
```
