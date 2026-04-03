# @radzor/pdf-generate — Usage Examples

## TypeScript

### Generate invoice
```typescript
import { PdfGenerate } from "@radzor/pdf-generate";

const pdf = new PdfGenerate();

const html = `
<h1>Invoice #INV-2026-042</h1>
<p>Date: April 3, 2026</p>
<p>Client: Acme Corp</p>
<ul>
  <li>Widget x10 — $50.00</li>
  <li>Service fee — $25.00</li>
</ul>
<p><strong>Total: $75.00</strong></p>
`;

await pdf.toFile(html, "invoice.pdf");
```

### Template-based report
```typescript
const template = `
<h1>Monthly Report — {{month}}</h1>
<p>Total users: {{users}}</p>
<p>Revenue: {{revenue}}</p>
<p>Growth: {{growth}}</p>
`;

const buffer = await pdf.fromTemplate(template, {
  month: "March 2026",
  users: "12,450",
  revenue: "$45,200",
  growth: "+12%",
});
res.setHeader("Content-Type", "application/pdf");
res.send(buffer);
```

### Landscape mode
```typescript
const buffer = await pdf.fromHtml(wideTableHtml, {
  landscape: true,
  pageSize: "Letter",
});
```

## Python

### Generate invoice
```python
from pdf_generate import PdfGenerate

pdf = PdfGenerate()

html = """
<h1>Invoice #INV-2026-042</h1>
<p>Date: April 3, 2026</p>
<p>Client: Acme Corp</p>
<ul>
  <li>Widget x10 — $50.00</li>
  <li>Service fee — $25.00</li>
</ul>
<p><strong>Total: $75.00</strong></p>
"""

pdf.to_file(html, "invoice.pdf")
```

### Template-based report
```python
template = """
<h1>Monthly Report — {{month}}</h1>
<p>Total users: {{users}}</p>
<p>Revenue: {{revenue}}</p>
"""

buffer = pdf.from_template(template, {
    "month": "March 2026",
    "users": "12,450",
    "revenue": "$45,200",
})
```

### Flask endpoint
```python
from flask import Flask, Response

@app.route("/api/invoice/<invoice_id>")
def download_invoice(invoice_id):
    invoice = db.get_invoice(invoice_id)
    buffer = pdf.from_template(invoice_template, invoice.__dict__)
    return Response(buffer, mimetype="application/pdf",
                    headers={"Content-Disposition": f"attachment; filename=invoice-{invoice_id}.pdf"})
```
