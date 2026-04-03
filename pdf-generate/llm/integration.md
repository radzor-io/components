# How to integrate @radzor/pdf-generate

## Overview
PDF generation from HTML content or templates. Creates invoices, reports, and documents with configurable page size, margins, and orientation.

## Integration Steps

### TypeScript

1. **Configure**:
```typescript
import { PdfGenerate } from "@radzor/pdf-generate";

const pdf = new PdfGenerate({ pageSize: "A4", margin: "20mm" });
```

2. **Generate from HTML**:
```typescript
const buffer = await pdf.fromHtml("<h1>Invoice</h1><p>Total: $99.00</p>");
fs.writeFileSync("invoice.pdf", buffer);
```

3. **Generate from template**:
```typescript
const buffer = await pdf.fromTemplate(
  "<h1>Invoice #{{id}}</h1><p>Total: {{total}}</p>",
  { id: "INV-001", total: "$99.00" }
);
```

### Python

No external dependencies.

1. **Configure**:
```python
from pdf_generate import PdfGenerate, PdfGenerateConfig

pdf = PdfGenerate(PdfGenerateConfig(page_size="A4"))
```

2. **Generate from HTML**:
```python
buffer = pdf.from_html("<h1>Invoice</h1><p>Total: $99.00</p>")
with open("invoice.pdf", "wb") as f:
    f.write(buffer)
```

3. **From template**:
```python
buffer = pdf.from_template(
    "<h1>Invoice #{{id}}</h1><p>Total: {{total}}</p>",
    {"id": "INV-001", "total": "$99.00"},
)
```

## Constraints
- Generates basic PDFs using raw PDF commands (Helvetica font, text-only).
- HTML is stripped to text — CSS styling is not rendered.
- For complex layouts with full CSS support, consider a headless browser approach.

## Composability
- PDF output can be stored via `@radzor/file-upload`.
- PDF buffers can be sent as email attachments via `@radzor/email-send`.
