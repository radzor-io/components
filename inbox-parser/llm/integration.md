# How to integrate @radzor/inbox-parser

## Overview
Parse raw MIME emails (RFC 2822) into structured data. Extract headers, subject, sender/recipients, HTML and plain-text body, and file attachments from raw email content. Handles multipart/mixed, multipart/alternative, nested multipart, base64, and quoted-printable encoding. No external dependencies.

## Integration Steps

### TypeScript

1. **Import and configure**:
```typescript
import { InboxParser } from "@radzor/inbox-parser";

const parser = new InboxParser({
  maxAttachmentSize: 10 * 1024 * 1024, // 10 MB
  decodeCharsets: true,
});
```

2. **Parse a raw email**:
```typescript
const rawEmail = fs.readFileSync("email.eml", "utf-8");
const parsed = await parser.parse(rawEmail);

console.log(parsed.subject);
console.log(parsed.from.name, parsed.from.email);
console.log(parsed.to.map(a => a.email));
console.log(parsed.html ?? parsed.text);
```

3. **Extract attachments only**:
```typescript
const attachments = await parser.extractAttachments(rawMime);
for (const att of attachments) {
  fs.writeFileSync(att.filename, att.content);
  console.log(`${att.filename} (${att.contentType}, ${att.size} bytes)`);
}
```

4. **Listen for events**:
```typescript
parser.on("onParsed", ({ messageId, subject, attachmentCount }) => {
  console.log(`Parsed: ${subject} (${attachmentCount} attachments)`);
});
```

### Python

1. **Configure**:
```python
from inbox_parser import InboxParser

parser = InboxParser(max_attachment_size=10 * 1024 * 1024)
```

2. **Parse**:
```python
with open("email.eml") as f:
    parsed = parser.parse(f.read())

print(parsed.subject)
print(parsed.from_address.email)
for att in parsed.attachments:
    print(f"{att.filename} ({att.size} bytes)")
```

## Environment Variables Required
- None.

## Constraints
- No external dependencies — pure TypeScript MIME parser.
- Handles multipart/mixed, multipart/alternative, and nested multipart structures.
- Base64 and quoted-printable transfer encodings are fully supported.
- RFC 2047 encoded-word headers (e.g. UTF-8 subjects) are decoded automatically.
- Attachments exceeding `maxAttachmentSize` are silently skipped.
- Very large emails (>50 MB) may cause high memory usage.

## Composability
- Parsed email body can be fed to `@radzor/llm-completion` for AI-powered analysis.
- Extracted attachments can be processed by `@radzor/document-ocr` or `@radzor/file-upload`.
