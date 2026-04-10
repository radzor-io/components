# @radzor/email-template — Usage Examples

## Register and render a welcome email
```typescript
import { EmailTemplate } from "@radzor/email-template";

const templates = new EmailTemplate();

templates.registerTemplate("welcome", `
<!DOCTYPE html>
<html>
<body style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
  <h1>Welcome, {{name}}!</h1>
  <p>Your account <strong>{{email}}</strong> has been created.</p>
  {{#if isPro}}
    <div style="background: #e8f5e9; padding: 16px; border-radius: 8px;">
      <p>🎉 You're on the <strong>Pro</strong> plan!</p>
    </div>
  {{else}}
    <p>Consider upgrading to Pro for more features.</p>
  {{/if}}
</body>
</html>
`);

const { html, text } = await templates.render("welcome", {
  name: "Alice",
  email: "alice@example.com",
  isPro: true,
});
```

## Template with loops (order confirmation)
```typescript
templates.registerTemplate("order-confirmation", `
<h1>Order Confirmation</h1>
<p>Thank you, {{customerName}}!</p>
<table>
  <tr><th>Item</th><th>Qty</th><th>Price</th></tr>
  {{#each items}}
    <tr>
      <td>{{name}}</td>
      <td>{{quantity}}</td>
      <td>{{price}}</td>
    </tr>
  {{/each}}
</table>
<p><strong>Total: {{total}}</strong></p>
`);

const { html } = await templates.render("order-confirmation", {
  customerName: "Bob",
  items: [
    { name: "Widget A", quantity: 2, price: "$19.99" },
    { name: "Widget B", quantity: 1, price: "$29.99" },
  ],
  total: "$69.97",
});
```

## Conditional sections with {{#unless}}
```typescript
templates.registerTemplate("notification", `
<p>Hi {{name}},</p>
{{#unless hasVerifiedEmail}}
  <p style="color: orange;">⚠️ Please verify your email address.</p>
{{/unless}}
{{#if newMessages}}
  <p>You have {{messageCount}} new messages.</p>
{{/if}}
`);

const { html } = await templates.render("notification", {
  name: "Charlie",
  hasVerifiedEmail: false,
  newMessages: true,
  messageCount: 5,
});
```

## Strict mode (throw on missing variables)
```typescript
const strict = new EmailTemplate({ strictMode: true });
strict.registerTemplate("test", "<p>Hello {{name}}, your code is {{code}}</p>");

try {
  await strict.render("test", { name: "Alice" }); // throws — "code" is missing
} catch (err) {
  console.error(err.message); // 'Missing template variable: "code"'
}
```

## List all templates
```typescript
templates.registerTemplate("welcome", "...");
templates.registerTemplate("reset-password", "...");
templates.registerTemplate("invoice", "...");

const names = templates.listTemplates();
console.log(names); // ["welcome", "reset-password", "invoice"]
```

## Integration with email sending
```typescript
import { EmailSend } from "@radzor/email-send";

const mailer = new EmailSend({ provider: "resend", apiKey: process.env.RESEND_API_KEY!, from: "noreply@app.com" });

const { html, text } = await templates.render("welcome", { name: "Alice", email: "alice@example.com" });
await mailer.send({ to: "alice@example.com", subject: "Welcome!", html, text });
```

---

## Python Examples

### Register and render
```python
from email_template import EmailTemplate

templates = EmailTemplate()

templates.register_template("welcome", """
<h1>Welcome, {{name}}!</h1>
<p>Your account {{email}} is ready.</p>
{{#if is_pro}}
  <p>Thank you for choosing Pro!</p>
{{/if}}
""")

result = templates.render("welcome", {
    "name": "Alice",
    "email": "alice@example.com",
    "is_pro": True,
})
print(result.html)
print(result.text)
```

### Template with loops
```python
templates.register_template("order", """
<h1>Order for {{customer}}</h1>
<ul>
  {{#each items}}
    <li>{{name}} - {{price}}</li>
  {{/each}}
</ul>
""")

result = templates.render("order", {
    "customer": "Bob",
    "items": [
        {"name": "Widget", "price": "$9.99"},
        {"name": "Gadget", "price": "$19.99"},
    ],
})
```

### List templates
```python
names = templates.list_templates()
print(names)  # ["welcome", "order"]
```

### Error handling
```python
templates.on("onError", lambda e: print(f"Template error [{e['code']}]: {e['message']}"))

try:
    templates.render("nonexistent", {})
except Exception as e:
    print(e)  # Template "nonexistent" not found
```
