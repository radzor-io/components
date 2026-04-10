# How to integrate @radzor/prompt-template

## Overview
Manages and renders prompt templates with variable interpolation, conditional sections, and few-shot example injection. Templates use `{{ variable }}` syntax by default, support `{{#if var}}...{{/if}}` conditionals, and a special `{{examples}}` slot for few-shot learning. No dependencies — runs anywhere.

## Integration Steps

### TypeScript

1. **Import and create an instance:**
```typescript
import { PromptTemplate } from "@radzor/prompt-template";

const pt = new PromptTemplate({
  strictMode: true,  // Throws on unresolved variables
});
```

2. **Register a template:**
```typescript
pt.register("classify", `
You are a {{role}}.
{{#if context}}Context: {{context}}{{/if}}

{{examples}}

Classify the following text:
"{{text}}"

Respond with the category.
`, { role: "text classifier" });
```

3. **Render with variables and examples:**
```typescript
const result = pt.render("classify", {
  text: "The stock market rallied today",
  context: "Financial news articles",
}, [
  { input: "Team wins championship", output: "sports" },
  { input: "New phone released", output: "technology" },
]);
console.log(result.text);
// Fully rendered prompt with examples injected
```

4. **Validate templates:**
```typescript
const validation = pt.validate("classify", { text: "hello" });
console.log(validation.valid);
console.log(validation.unresolvedVariables); // Variables not yet provided
```

### Python

1. **Create and register:**
```python
from prompt_template import PromptTemplate, PromptTemplateConfig

pt = PromptTemplate(PromptTemplateConfig(strict_mode=True))

pt.register("classify", """
You are a {{role}}.
Classify: "{{text}}"
""", defaults={"role": "classifier"})
```

2. **Render:**
```python
result = pt.render("classify", {"text": "Breaking news today"})
print(result.text)
```

## Environment Variables Required
None — this component is pure computation.

## Constraints
- No network calls or API keys required
- Runs in Node.js, browsers, Deno, or any JavaScript runtime
- Template variable names must match `[a-zA-Z_][a-zA-Z0-9_]*`
- In strict mode, unresolved variables cause an error; in non-strict mode, they remain as `{{varName}}`
- The `{{examples}}` placeholder is replaced with formatted few-shot examples or removed if none are provided

## Composability
Connections to other Radzor components will be defined in a separate pass.
