# zip-archive — Integration Guide

## Overview

Pure TypeScript ZIP archive reader and writer with no npm dependencies. Uses Node.js built-in `zlib` for deflate compression and implements the ZIP file format (local headers, central directory, EOCD) from scratch. Supports create, list, extract, and addFile operations entirely in memory.

## Installation

```bash
radzor add zip-archive
```

## Configuration

| Input         | Type                      | Required | Default     | Description                          |
| ------------- | ------------------------- | -------- | ----------- | ------------------------------------ |
| `compression` | `'deflate'` \| `'store'`  | no       | `'deflate'` | Compression method for new archives  |
| `level`       | number (1–9)              | no       | `6`         | Deflate compression level            |

## Quick Start

```typescript
import { ZipArchive } from "./components/zip-archive/src";

const zip = new ZipArchive({ compression: "deflate", level: 6 });

const archive = await zip.create([
  { name: "hello.txt", content: "Hello, World!" },
  { name: "data.json", content: JSON.stringify({ ok: true }) },
]);

// archive is a Buffer — write to disk or return as HTTP response
import { writeFileSync } from "fs";
writeFileSync("output.zip", archive);
```

## Integration Steps

1. Instantiate `ZipArchive` with your preferred compression settings.
2. For creating: pass an array of `{ name, content }` objects to `create()`.
3. For reading: pass an archive `Buffer` to `list()` or `extract()`.
4. For modifying: use `addFile()` — it extracts, appends, and re-creates in one call.
5. Subscribe to events to track progress or catch errors.

## Actions

### create

Build a new ZIP archive from an array of file inputs. Files can be `Buffer` or `string` content. Returns the full archive as a `Buffer`.

**Parameters:** `files` (`Array<{ name: string; content: Buffer | string }>`)
**Returns:** `Promise<Buffer>`

### list

Parse a ZIP archive and return metadata for all entries without decompressing file data.

**Parameters:** `archive` (`Buffer | string`)
**Returns:** `Promise<Array<{ name, size, compressedSize, isDirectory }>>`

### extract

Decompress all files in a ZIP archive and return them as a `Map<filename, Buffer>`. Directories are skipped.

**Parameters:** `archive` (`Buffer | string`), `outputDir?` (string, informational only — extraction is in-memory)
**Returns:** `Promise<Map<string, Buffer>>`

### addFile

Add a single file to an existing archive. Internally extracts all current files, appends the new one, and rebuilds the archive.

**Parameters:** `archive` (Buffer), `name` (string), `content` (Buffer | string)
**Returns:** `Promise<Buffer>`

## Events

| Event         | Payload                              | When emitted                        |
| ------------- | ------------------------------------ | ----------------------------------- |
| `onFileAdded` | `{ name, size }`                     | After each file is written during `create` |
| `onArchived`  | `{ fileCount, totalSize }`           | When a `create` call completes      |
| `onExtracted` | `{ name, size }`                     | After each file is decompressed     |
| `onError`     | `{ code, message }`                  | On invalid ZIP format or errors     |

## Constraints

- All operations are in-memory. For archives larger than ~500 MB, streaming is needed.
- Directory entries (names ending with `/`) are preserved during `list` but skipped during `extract`.
- `compression: "store"` stores files verbatim with no compression — faster but larger output.
- CRC32 is computed over the uncompressed data; the implementation uses the standard 0xEDB88320 polynomial.
- Only ZIP 2.0 (standard deflate) is supported — no ZIP64, AES encryption, or split archives.
