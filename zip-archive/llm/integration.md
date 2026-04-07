# How to integrate @radzor/zip-archive

## Overview
Create, read, and extract ZIP archives. Supports streaming creation for large archives, per-file compression levels, and in-memory operations. No native dependencies — pure JavaScript implementation.

## Integration Steps

### TypeScript

1. **No external dependencies required.** This component uses native APIs only.

2. **Create an instance:**
```typescript
import { ZipArchive } from "@radzor/zip-archive";

const zipArchive = new ZipArchive({

});
```

3. **Use the component:**
```typescript
const result = await zipArchive.create("example-files");
const result = await zipArchive.extract("example-archive", "example-outputDir");
const result = await zipArchive.list("example-archive");
```

### Python

```python
from zip_archive import ZipArchive, ZipArchiveConfig
import os

zipArchive = ZipArchive(ZipArchiveConfig(

))
```

## Events

- **onFileAdded** — Fired when a file is added to the archive. Payload: `name: string`, `size: number`
- **onArchived** — Fired when archive creation completes. Payload: `files: number`, `bytes: number`
- **onExtracted** — Fired when an archive is extracted. Payload: `files: number`, `outputDir: string`
- **onError** — Fired on archive or extraction error. Payload: `code: string`, `message: string`

## Constraints

In-memory operations — large archives require sufficient heap memory. For archives over 500MB, use streaming mode. Directory entries must end with /.
