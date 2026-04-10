# How to integrate @radzor/json-transform

## Overview
Transforms JSON data using dot-path field mapping, filtering, flattening, merging, and a rule-based transformation pipeline. Useful for reshaping API responses, preparing data for LLM contexts, ETL pipelines, and mapping between different data schemas. No dependencies — runs anywhere.

## Integration Steps

### TypeScript

1. **Import and create an instance:**
```typescript
import { JsonTransform } from "@radzor/json-transform";

const jt = new JsonTransform({ strictMode: false });
```

2. **Map fields between schemas:**
```typescript
const apiResponse = {
  user: { firstName: "Alice", lastName: "Smith", email: "alice@example.com" },
  metadata: { createdAt: "2024-01-15", role: "admin" },
};

const mapped = jt.map(apiResponse, {
  "name": "user.firstName",
  "email": "user.email",
  "role": "metadata.role",
  "joined": "metadata.createdAt",
});
// { name: "Alice", email: "alice@example.com", role: "admin", joined: "2024-01-15" }
```

3. **Apply transformation rules:**
```typescript
const result = jt.transform(data, [
  { op: "pick", fields: ["name", "email", "age"] },
  { op: "rename", from: "email", to: "contactEmail" },
  { op: "set", path: "processed", value: true },
]);
console.log(result.data);
```

4. **Filter arrays:**
```typescript
const users = [
  { name: "Alice", age: 30, active: true },
  { name: "Bob", age: 17, active: true },
  { name: "Charlie", age: 25, active: false },
];

const adults = jt.filter(users, { field: "age", operator: "gte", value: 18 });
// [{ name: "Alice", ... }, { name: "Charlie", ... }]
```

### Python

1. **Create and use:**
```python
from json_transform import JsonTransform

jt = JsonTransform()
mapped = jt.map(api_data, {"name": "user.firstName", "email": "user.email"})
```

2. **Filter and flatten:**
```python
adults = jt.filter(users, {"field": "age", "operator": "gte", "value": 18})
flat = jt.flatten(nested_data, separator=".")
```

## Environment Variables Required
None — this component is pure computation.

## Constraints
- No network calls or API keys required
- Runs in Node.js, browsers, Deno, or any JavaScript runtime
- Path expressions use dot notation (`a.b.c`) with array index support (`items[0]`)
- Deep clone is used on all transformations to avoid mutating input data
- The `compute` rule operation accepts a function, which is not serializable

## Composability
Connections to other Radzor components will be defined in a separate pass.
