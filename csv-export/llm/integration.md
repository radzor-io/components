# How to integrate @radzor/csv-export

## Overview
Generate and parse CSV files from data arrays. Supports custom delimiters, headers, and streaming.

## Integration Steps

### TypeScript

1. **No external dependencies required.** This component uses native APIs only.

2. **Create an instance:**
```typescript
import { CSVExport } from "@radzor/csv-export";

const csvExport = new CSVExport({

});
```

3. **Use the component:**
```typescript
csvExport.generate("example-data", "example-columns");
csvExport.parse("example-csv");
const result = await csvExport.toFile("example-data", "example-outputPath");
```

### Python

```python
from csv_export import CSVExport, CSVExportConfig
import os

csvExport = CSVExport(CSVExportConfig(

))
```

## Events

- **onGenerated** — Fired when CSV generation completes. Payload: `rows: number`, `bytes: number`
- **onError** — Fired on error. Payload: `code: string`, `message: string`
