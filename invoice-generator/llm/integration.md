# How to integrate @radzor/invoice-generator

## Overview
Generate professional PDF invoices from structured data. Build invoices by setting customer info, adding line items, and generating a PDF buffer with automatic tax calculation and formatted layout.

## Integration Steps

### TypeScript

1. **Install dependency**: `npm install pdfkit`

2. **Import and configure**:
```typescript
import { InvoiceGenerator } from "@radzor/invoice-generator";

const invoices = new InvoiceGenerator({
  companyName: "Acme Corp",
  companyAddress: "123 Main St, San Francisco, CA 94102",
  currency: "USD",
  taxRate: 8.5,
  invoicePrefix: "INV",
});
```

3. **Build and generate an invoice**:
```typescript
invoices.setCustomer("Jane Doe", "jane@example.com", "456 Oak Ave, NY 10001");
invoices.addLineItem("Pro Plan (Monthly)", 1, 49.99);
invoices.addLineItem("Extra seats (x3)", 3, 9.99);

const { pdf, data } = await invoices.generate();
// pdf is a Buffer — write to file or send as response
fs.writeFileSync(`${data.invoiceNumber}.pdf`, pdf);
```

4. **Listen for events**:
```typescript
invoices.on("onGenerated", ({ invoiceNumber, total, customerEmail }) => {
  console.log(`Invoice ${invoiceNumber} generated: $${total}`);
});
```

### Python

1. **Install dependency**: `pip install pdfkit` (or equivalent PDF library)

2. **Configure**:
```python
from invoice_generator import InvoiceGenerator

invoices = InvoiceGenerator(
    company_name="Acme Corp",
    company_address="123 Main St, San Francisco, CA 94102",
    currency="USD",
    tax_rate=8.5,
)
```

3. **Build and generate**:
```python
invoices.set_customer("Jane Doe", "jane@example.com", "456 Oak Ave, NY 10001")
invoices.add_line_item("Pro Plan (Monthly)", 1, 49.99)
invoices.add_line_item("Extra seats (x3)", 3, 9.99)

result = invoices.generate()
with open(f"{result.data.invoice_number}.pdf", "wb") as f:
    f.write(result.pdf)
```

## Environment Variables Required
- None required. All configuration is passed via the constructor.

## Constraints
- Requires `pdfkit` npm package for PDF generation.
- Customer must be set via `setCustomer()` before calling `generate()`.
- At least one line item must be added before generating.
- After `generate()`, line items and customer are reset for the next invoice.

## Composability
- Generated PDF buffer can be attached to `@radzor/email-send` for delivery.
- `invoiceData` output can feed into `@radzor/csv-export` for accounting records.
