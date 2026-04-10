# How to integrate @radzor/email-template

## Overview
Render email templates with Handlebars-style variable interpolation. Register reusable templates with `{{variable}}` placeholders, `{{#if}}`, `{{#each}}`, and `{{#unless}}` blocks, then render them with data contexts to produce HTML and plain text output. No external dependencies.

## Integration Steps

### TypeScript

1. **Import and configure**:
```typescript
import { EmailTemplate } from "@radzor/email-template";

const templates = new EmailTemplate({
  strictMode: false, // set true to throw on missing variables
});
```

2. **Register templates**:
```typescript
templates.registerTemplate("welcome", `
  <h1>Welcome, {{name}}!</h1>
  <p>Your account <strong>{{email}}</strong> has been created.</p>
  {{#if isPro}}
    <p>Thank you for choosing the Pro plan!</p>
  {{else}}
    <p>Upgrade to Pro for advanced features.</p>
  {{/if}}
  <h2>Your features:</h2>
  <ul>
    {{#each features}}
      <li>{{this}}</li>
    {{/each}}
  </ul>
`);
```

3. **Render with data**:
```typescript
const { html, text } = await templates.render("welcome", {
  name: "Alice",
  email: "alice@example.com",
  isPro: true,
  features: ["Dashboard", "Analytics", "API Access"],
});
```

4. **List registered templates**:
```typescript
const names = templates.listTemplates(); // ["welcome"]
```

### Python

1. **Configure**:
```python
from email_template import EmailTemplate

templates = EmailTemplate(strict_mode=False)
```

2. **Register and render**:
```python
templates.register_template("welcome", "<h1>Welcome, {{name}}!</h1>")
result = templates.render("welcome", {"name": "Alice"})
print(result.html)
```

## Environment Variables Required
- None.

## Constraints
- No external dependencies — uses a built-in template engine.
- Templates must be registered with `registerTemplate()` before rendering.
- Supported blocks: `{{var}}`, `{{{raw}}}` (unescaped), `{{#if}}`, `{{#each}}`, `{{#unless}}`.
- Custom helpers are not supported — use `{{#if}}` with pre-computed boolean values.
- `{{var}}` output is HTML-escaped; use `{{{var}}}` for raw HTML injection.

## Composability
- Rendered HTML/text output connects to `@radzor/email-send` for delivery.
- Template data can be populated from `@radzor/structured-output` or database queries.
