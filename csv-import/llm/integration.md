# How to integrate @radzor/csv-import

## Overview
Parse and validate CSV files. For large files, use parseStream() for memory-efficient batch processing.

## Integration Steps

1. **Setup:**
```typescript
import { CsvImport } from "@radzor/csv-import";
const csv = new CsvImport({
  hasHeader: true,
  delimiter: ",",
  batchSize: 500,
  schema: {
    email: "string",
    age: "number",
    active: "boolean",
    createdAt: "date",
  },
});
```

2. **Parse an uploaded file:**
```typescript
const file = await req.formData().get("file") as File;
const buffer = Buffer.from(await file.arrayBuffer());
const rows = await csv.parseBuffer(buffer);
await db.users.insertMany(rows);
```

3. **Stream large files (recommended for files > 10MB):**
```typescript
csv.on("onBatch", async ({ rows, batchNumber }) => {
  await db.users.insertMany(rows);
  console.log(`Inserted batch ${batchNumber}`);
});
csv.on("onError", ({ line, message }) => {
  console.warn(`Row ${line}: ${message}`);
});

const stream = fs.createReadStream("users.csv");
const stats = await csv.parseStream(stream);
console.log(`Imported ${stats.totalRows - stats.errorRows} rows`);
```

4. **Validate before inserting:**
```typescript
const rows = await csv.parseBuffer(buffer);
const { valid, errors } = csv.validate(rows);
if (errors.length > 0) return res.json({ errors });
await db.insertMany(valid);
```
