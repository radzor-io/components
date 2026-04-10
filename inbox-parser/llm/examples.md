# @radzor/inbox-parser — Usage Examples

## Parse an email from file
```typescript
import { InboxParser } from "@radzor/inbox-parser";
import * as fs from "fs";

const parser = new InboxParser({ maxAttachmentSize: 10 * 1024 * 1024 });

const raw = fs.readFileSync("email.eml", "utf-8");
const email = await parser.parse(raw);

console.log("From:", email.from.name, `<${email.from.email}>`);
console.log("To:", email.to.map(a => a.email).join(", "));
console.log("Subject:", email.subject);
console.log("Date:", email.date);
console.log("Body:", email.text ?? email.html);
console.log("Attachments:", email.attachments.length);
```

## Extract and save attachments
```typescript
const attachments = await parser.extractAttachments(rawMime);

for (const att of attachments) {
  fs.writeFileSync(`downloads/${att.filename}`, att.content);
  console.log(`Saved: ${att.filename} (${att.contentType}, ${att.size} bytes)`);
}
```

## Webhook email receiver (Express)
```typescript
app.post("/api/incoming-email", express.text({ type: "*/*", limit: "25mb" }), async (req, res) => {
  try {
    const email = await parser.parse(req.body);

    await db.emails.create({
      from: email.from.email,
      to: email.to.map(a => a.email),
      subject: email.subject,
      body: email.html ?? email.text,
      receivedAt: new Date(email.date),
    });

    for (const att of email.attachments) {
      await storage.upload(`attachments/${att.filename}`, att.content);
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("Failed to parse email:", err);
    res.sendStatus(400);
  }
});
```

## Access all headers
```typescript
const email = await parser.parse(rawMime);

console.log("Message-ID:", email.headers["message-id"]);
console.log("Reply-To:", email.headers["reply-to"]);
console.log("X-Mailer:", email.headers["x-mailer"]);
console.log("DKIM-Signature:", email.headers["dkim-signature"]);
```

## Event-driven processing
```typescript
parser.on("onParsed", ({ messageId, subject, attachmentCount }) => {
  console.log(`Parsed email: "${subject}" (${attachmentCount} attachments)`);
  metrics.increment("emails_parsed");
});

parser.on("onError", ({ message, phase }) => {
  console.error(`Parse error in ${phase}: ${message}`);
  metrics.increment("email_parse_errors");
});
```

## Filter emails by content type
```typescript
const email = await parser.parse(rawMime);

if (email.html) {
  // Process HTML email — extract links, images, etc.
  const links = email.html.match(/href="([^"]+)"/g) ?? [];
  console.log("Links found:", links.length);
}

if (email.attachments.some(a => a.contentType === "application/pdf")) {
  const pdfs = email.attachments.filter(a => a.contentType === "application/pdf");
  console.log(`Found ${pdfs.length} PDF attachment(s)`);
}
```

---

## Python Examples

### Parse an email
```python
from inbox_parser import InboxParser

parser = InboxParser(max_attachment_size=10 * 1024 * 1024)

with open("email.eml") as f:
    email = parser.parse(f.read())

print(f"From: {email.from_address.name} <{email.from_address.email}>")
print(f"Subject: {email.subject}")
print(f"Date: {email.date}")
print(f"Body: {email.text or email.html}")
```

### Extract attachments
```python
attachments = parser.extract_attachments(raw_mime)
for att in attachments:
    with open(f"downloads/{att.filename}", "wb") as f:
        f.write(att.content)
    print(f"Saved: {att.filename} ({att.content_type}, {att.size} bytes)")
```

### Flask webhook receiver
```python
from flask import Flask, request

app = Flask(__name__)

@app.route("/incoming-email", methods=["POST"])
def receive_email():
    email = parser.parse(request.data)
    db.emails.create(
        from_addr=email.from_address.email,
        subject=email.subject,
        body=email.text or email.html,
    )
    return "", 200
```

### Event handling
```python
parser.on("onParsed", lambda e: print(
    f"Parsed: {e['subject']} ({e['attachmentCount']} attachments)"
))
```
