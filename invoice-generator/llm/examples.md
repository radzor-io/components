# @radzor/invoice-generator — Usage Examples

## Basic invoice generation
```typescript
import { InvoiceGenerator } from "@radzor/invoice-generator";
import * as fs from "fs";

const invoices = new InvoiceGenerator({
  companyName: "Acme Corp",
  companyAddress: "123 Main St, San Francisco, CA 94102",
  currency: "USD",
  taxRate: 8.5,
});

invoices.setCustomer("Jane Doe", "jane@example.com", "456 Oak Ave, NY 10001");
invoices.addLineItem("Web Design Services", 1, 2500.00);
invoices.addLineItem("Hosting (Annual)", 1, 120.00);
invoices.addLineItem("Domain Registration", 2, 12.99);

const { pdf, data } = await invoices.generate();
fs.writeFileSync(`invoices/${data.invoiceNumber}.pdf`, pdf);
console.log(`Generated ${data.invoiceNumber}: $${data.total}`);
```

## SaaS subscription invoice (Express endpoint)
```typescript
app.post("/api/generate-invoice", async (req, res) => {
  const { customer, items } = req.body;

  invoices.setCustomer(customer.name, customer.email, customer.address);
  for (const item of items) {
    invoices.addLineItem(item.description, item.quantity, item.unitPrice);
  }

  const { pdf, data } = await invoices.generate();

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${data.invoiceNumber}.pdf"`);
  res.send(pdf);
});
```

## Invoice with event logging
```typescript
invoices.on("onGenerated", ({ invoiceNumber, total, customerEmail }) => {
  console.log(`Invoice ${invoiceNumber} for ${customerEmail}: $${total}`);
  db.invoices.create({ number: invoiceNumber, total, email: customerEmail });
});

invoices.on("onError", ({ code, message }) => {
  console.error(`Invoice error [${code}]: ${message}`);
});
```

## Multi-currency invoices
```typescript
const euroInvoices = new InvoiceGenerator({
  companyName: "Euro Tech GmbH",
  companyAddress: "Hauptstraße 1, 10115 Berlin",
  currency: "EUR",
  taxRate: 19,
});

euroInvoices.setCustomer("Hans Mueller", "hans@example.de");
euroInvoices.addLineItem("Beratung (8 Stunden)", 8, 150.00);
const { pdf } = await euroInvoices.generate();
```

## Batch invoice generation
```typescript
const customers = await db.customers.findAll({ where: { billingDay: today } });

for (const customer of customers) {
  invoices.setCustomer(customer.name, customer.email, customer.address);

  const usage = await db.usage.findByCustomer(customer.id);
  for (const item of usage) {
    invoices.addLineItem(item.description, item.quantity, item.unitPrice);
  }

  const { pdf, data } = await invoices.generate();
  await emailService.send({
    to: customer.email,
    subject: `Invoice ${data.invoiceNumber}`,
    html: `<p>Please find your invoice attached. Total: $${data.total}</p>`,
    attachments: [{ filename: `${data.invoiceNumber}.pdf`, content: pdf }],
  });
}
```

## Access structured invoice data
```typescript
const { data } = await invoices.generate();

console.log("Invoice:", data.invoiceNumber);
console.log("Date:", data.date);
console.log("Customer:", data.customer.name);
console.log("Line items:");
for (const item of data.lineItems) {
  console.log(`  ${item.description}: ${item.quantity} × $${item.unitPrice} = $${item.total}`);
}
console.log("Subtotal:", data.subtotal);
console.log("Tax:", data.taxAmount);
console.log("Total:", data.total);
```

---

## Python Examples

### Basic invoice
```python
from invoice_generator import InvoiceGenerator

invoices = InvoiceGenerator(
    company_name="Acme Corp",
    company_address="123 Main St, SF CA",
    currency="USD",
    tax_rate=8.5,
)

invoices.set_customer("Jane Doe", "jane@example.com")
invoices.add_line_item("Pro Plan", 1, 49.99)
invoices.add_line_item("Extra Seats", 3, 9.99)

result = invoices.generate()
with open(f"{result.data.invoice_number}.pdf", "wb") as f:
    f.write(result.pdf)
```

### Flask endpoint
```python
from flask import Flask, request, send_file
from io import BytesIO

@app.route("/api/invoice", methods=["POST"])
def generate_invoice():
    data = request.json
    invoices.set_customer(data["name"], data["email"])
    for item in data["items"]:
        invoices.add_line_item(item["desc"], item["qty"], item["price"])

    result = invoices.generate()
    return send_file(
        BytesIO(result.pdf),
        mimetype="application/pdf",
        download_name=f"{result.data.invoice_number}.pdf",
    )
```

### Event logging
```python
invoices.on("onGenerated", lambda e: print(
    f"Invoice {e['invoiceNumber']}: ${e['total']} → {e['customerEmail']}"
))
```
