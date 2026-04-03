# csv-export — Integration Guide

## Overview

Generate and parse CSV files from data arrays. Supports custom delimiters, quoted fields, and file output. RFC 4180 compliant parsing.

## Installation

```bash
radzor add csv-export
```

## Configuration

| Input            | Type    | Required | Description                      |
| ---------------- | ------- | -------- | -------------------------------- |
| `delimiter`      | string  | no       | Column delimiter (default: `,`)  |
| `includeHeaders` | boolean | no       | Include header row (default: true)|
| `quoteAll`       | boolean | no       | Quote all fields (default: false)|

## Quick Start

### TypeScript

```typescript
import { CsvExport } from "./components/csv-export/src";

const csv = new CsvExport();

const output = csv.generate([
  { name: "Alice", age: "30", city: "Paris" },
  { name: "Bob", age: "25", city: "London" },
]);
// name,age,city\nAlice,30,Paris\nBob,25,London
```

### Python

```python
from components.csv_export.src import CsvExport

csv = CsvExport()

output = csv.generate([
    {"name": "Alice", "age": "30", "city": "Paris"},
    {"name": "Bob", "age": "25", "city": "London"},
])
```

## Actions

### generate — Generate CSV from array of objects
### generateFromArrays / generate_from_arrays — Generate CSV from headers + 2D array
### parse — Parse CSV string into array of objects
### toFile / to_file — Write CSV directly to a file

## Requirements

- No external dependencies — uses stdlib only
