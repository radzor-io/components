# zip-archive — Examples

## Create a ZIP archive from strings and buffers

```typescript
import { ZipArchive } from "./components/zip-archive/src";

const zip = new ZipArchive({ compression: "deflate", level: 6 });

const archive = await zip.create([
  { name: "README.md", content: "# My Project\nGenerated archive." },
  { name: "data/config.json", content: JSON.stringify({ version: 1, debug: false }, null, 2) },
  { name: "data/payload.bin", content: Buffer.from([0x00, 0x01, 0x02, 0xff]) },
]);

import { writeFileSync } from "fs";
writeFileSync("output.zip", archive);
console.log(`Archive size: ${archive.length} bytes`);
```

## List files in an existing archive

```typescript
import { ZipArchive } from "./components/zip-archive/src";
import { readFileSync } from "fs";

const zip = new ZipArchive();

const archiveBuf = readFileSync("output.zip");
const entries = await zip.list(archiveBuf);

for (const entry of entries) {
  const ratio = entry.size > 0 ? ((1 - entry.compressedSize / entry.size) * 100).toFixed(1) : "0";
  console.log(`${entry.name} — ${entry.size}B → ${entry.compressedSize}B (${ratio}% saved)`);
}
```

## Extract all files from a ZIP

```typescript
import { ZipArchive } from "./components/zip-archive/src";
import { readFileSync, writeFileSync, mkdirSync, dirname } from "fs";
import { join } from "path";

const zip = new ZipArchive();

zip.on("onExtracted", ({ name, size }) => {
  console.log(`Extracted ${name} (${size} bytes)`);
});

const archiveBuf = readFileSync("output.zip");
const files = await zip.extract(archiveBuf);

for (const [name, content] of files) {
  const outPath = join("/tmp/extracted", name);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, content);
}
```

## Add a file to an existing archive

```typescript
import { ZipArchive } from "./components/zip-archive/src";
import { readFileSync, writeFileSync } from "fs";

const zip = new ZipArchive();

const original = readFileSync("output.zip");
const updated = await zip.addFile(original, "CHANGELOG.md", "## v1.1.0\n- Added new feature");

writeFileSync("output-updated.zip", updated);

// Verify the new file is present
const entries = await zip.list(updated);
console.log(entries.map((e) => e.name));
// ["README.md", "data/config.json", "data/payload.bin", "CHANGELOG.md"]
```

## Store without compression + event tracking

```typescript
import { ZipArchive } from "./components/zip-archive/src";

const zip = new ZipArchive({ compression: "store" });

zip.on("onFileAdded", ({ name, size }) => {
  console.log(`Added ${name} (${size} bytes, uncompressed)`);
});

zip.on("onArchived", ({ fileCount, totalSize }) => {
  console.log(`Archive complete: ${fileCount} files, ${totalSize} bytes total`);
});

zip.on("onError", ({ code, message }) => {
  console.error(`[${code}] ${message}`);
});

const archive = await zip.create([
  { name: "image.png", content: Buffer.alloc(1024, 0xff) },
  { name: "notes.txt", content: "No compression applied." },
]);
```
