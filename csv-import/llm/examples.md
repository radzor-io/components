# @radzor/csv-import — Usage Examples

## 1. Parse an Uploaded File with Schema Coercion

```typescript
import { CsvImport } from "@radzor/csv-import";

const csv = new CsvImport({
  hasHeader: true,
  delimiter: ",",
  schema: {
    email: "string",
    age: "number",
    active: "boolean",
    createdAt: "date",
  },
});

// In a Next.js API route
const file = (await req.formData()).get("file") as File;
const buffer = Buffer.from(await file.arrayBuffer());
const rows = await csv.parseBuffer(buffer);

await db.users.insertMany(rows);
// rows: [{ email: "alice@example.com", age: 30, active: true, createdAt: Date(...) }, ...]
```

## 2. Stream a Large CSV File with Batch Inserts

```typescript
import { CsvImport } from "@radzor/csv-import";
import fs from "fs";

const csv = new CsvImport({ batchSize: 500, hasHeader: true });

csv.on("onBatch", async ({ rows, batchNumber }) => {
  await db.products.insertMany(rows);
  console.log(`Inserted batch ${batchNumber} (${rows.length} rows)`);
});

csv.on("onError", ({ line, message }) => {
  console.warn(`Skipping row ${line}: ${message}`);
});

csv.on("onComplete", ({ totalRows, errorRows, durationMs }) => {
  console.log(`Done: ${totalRows} rows in ${durationMs}ms, ${errorRows} errors`);
});

const stream = fs.createReadStream("/data/products.csv");
const stats = await csv.parseStream(stream);
console.log(`Imported ${stats.validRows} valid rows`);
```

## 3. Validate Rows Before Inserting

```typescript
import { CsvImport } from "@radzor/csv-import";

const csv = new CsvImport({
  schema: { email: "string", price: "number", active: "boolean" },
});

const buffer = Buffer.from(rawCsvString);
const rows = await csv.parseBuffer(buffer);
const { valid, errors } = csv.validate(rows);

if (errors.length > 0) {
  return Response.json(
    { message: "Validation failed", errors },
    { status: 422 }
  );
}

await db.items.insertMany(valid);
return Response.json({ inserted: valid.length });
```

## 4. Peek at Headers Before Processing

```typescript
import { CsvImport } from "@radzor/csv-import";

const csv = new CsvImport();

const file = (await req.formData()).get("file") as File;
const buffer = Buffer.from(await file.arrayBuffer());

const headers = await csv.getHeaders(buffer);
console.log(headers); // ["id", "name", "email", "age"]

// Validate expected columns before parsing the full file
const required = ["id", "email"];
const missing = required.filter((col) => !headers.includes(col));
if (missing.length > 0) {
  return Response.json({ error: `Missing columns: ${missing.join(", ")}` }, { status: 400 });
}

const rows = await csv.parseBuffer(buffer);
```

## 5. Parse a Tab-Separated Values (TSV) File

```typescript
import { CsvImport } from "@radzor/csv-import";

const tsv = new CsvImport({
  delimiter: "\t",
  hasHeader: true,
  skipEmptyRows: true,
  schema: {
    product_id: "string",
    quantity: "number",
    unit_price: "number",
  },
});

tsv.on("onRow", ({ row, index }) => {
  console.log(`Row ${index}:`, row);
});

const buffer = fs.readFileSync("inventory.tsv");
const rows = await tsv.parseBuffer(buffer);
const total = rows.reduce((sum, r) => sum + (r.quantity as number) * (r.unit_price as number), 0);
console.log(`Total inventory value: $${total.toFixed(2)}`);
```
