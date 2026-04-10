# How to integrate @radzor/guardrails

## Overview
Validates LLM inputs and outputs against configurable safety rules. Built-in rules cover PII detection (email, phone, SSN, credit card), prompt injection detection, toxic content filtering, empty content, and repetition detection. Supports custom rules via patterns, keywords, or validator functions. No dependencies or API keys required.

## Integration Steps

### TypeScript

1. **Import and create an instance:**
```typescript
import { Guardrails } from "@radzor/guardrails";

const guard = new Guardrails({
  enableBuiltinRules: true,
  maxInputLength: 50000,
  maxOutputLength: 100000,
});
```

2. **Validate user input before sending to LLM:**
```typescript
const inputResult = guard.validateInput(userPrompt);
if (!inputResult.passed) {
  console.error("Input blocked:", inputResult.violations);
  return;
}
// Safe to send to LLM
```

3. **Validate LLM output before showing to user:**
```typescript
const outputResult = guard.validateOutput(llmResponse);
if (!outputResult.passed) {
  console.warn("Output contains violations:", outputResult.violations);
}
```

4. **Add custom rules:**
```typescript
guard.addRule({
  name: "no_competitor_mentions",
  description: "Output should not mention competitor names",
  severity: "warning",
  direction: "output",
  keywords: ["CompetitorA", "CompetitorB", "RivalCo"],
});
```

5. **Listen for violations:**
```typescript
guard.on("onViolation", ({ rule, severity, direction }) => {
  console.log(`[${severity}] ${rule} triggered on ${direction}`);
});
```

### Python

1. **Create and validate:**
```python
from guardrails import Guardrails, GuardrailsConfig

guard = Guardrails(GuardrailsConfig(enable_builtin_rules=True))

result = guard.validate_input(user_prompt)
if not result.passed:
    print("Blocked:", result.violations)
```

2. **Add custom rules:**
```python
guard.add_rule({
    "name": "max_urls",
    "description": "Limit URLs in output",
    "severity": "warning",
    "direction": "output",
    "patterns": [r"https?://\S+"],
})
```

## Environment Variables Required
None — all validation is local.

## Constraints
- PII detection uses regex patterns — not 100% accurate. For production PII handling, layer with a dedicated PII service
- Prompt injection detection catches common patterns but sophisticated attacks may bypass it
- Built-in rules are English-centric; add custom rules for other languages
- All processing is synchronous and runs locally — no network calls

## Composability
Connections to other Radzor components will be defined in a separate pass.
