# How to integrate @radzor/data-validator

## Overview
Validates data against JSON Schema-style definitions or custom validation rules. Supports type checking, required fields, string/number constraints, pattern matching, enums, type coercion, and custom validators. Useful for validating API inputs, form data, and LLM-generated structured output. No dependencies.

## Integration Steps

### TypeScript

1. **Import and create an instance:**
```typescript
import { DataValidator } from "@radzor/data-validator";

const validator = new DataValidator({
  coerceTypes: false,
  allErrors: true,
});
```

2. **Register and validate against a schema:**
```typescript
validator.addSchema("user", {
  type: "object",
  required: ["name", "email", "age"],
  properties: {
    name: { type: "string", minLength: 1, maxLength: 100 },
    email: { type: "string", pattern: "^[^@]+@[^@]+\\.[^@]+$" },
    age: { type: "number", minimum: 0, maximum: 150 },
    role: { type: "string", enum: ["admin", "user", "viewer"] },
  },
});

const result = validator.validate({ name: "Alice", email: "alice@example.com", age: 30 }, "user");
console.log(result.valid); // true
```

3. **Handle validation errors:**
```typescript
const bad = validator.validate({ name: "", email: "not-an-email", age: -5 }, "user");
console.log(bad.valid); // false
for (const err of bad.errors) {
  console.log(`${err.path}: ${err.message} (${err.rule})`);
}
```

4. **Listen for failures:**
```typescript
validator.on("onValidationFailed", ({ schemaName, errorCount, firstError }) => {
  console.log(`Validation failed for ${schemaName}: ${errorCount} errors. First: ${firstError}`);
});
```

### Python

1. **Create and validate:**
```python
from data_validator import DataValidator, DataValidatorConfig

validator = DataValidator(DataValidatorConfig(coerce_types=False))

validator.add_schema("user", {
    "type": "object",
    "required": ["name", "email"],
    "properties": {
        "name": {"type": "string", "minLength": 1},
        "email": {"type": "string", "pattern": r"^[^@]+@[^@]+\.[^@]+$"},
    },
})

result = validator.validate({"name": "Alice", "email": "alice@example.com"}, "user")
print(f"Valid: {result.valid}")
```

## Environment Variables Required
None — this component is pure computation.

## Constraints
- Implements a subset of JSON Schema (type, required, properties, items, minimum, maximum, minLength, maxLength, pattern, enum)
- Not a full JSON Schema validator — does not support `$ref`, `allOf`, `oneOf`, `anyOf`, `if/then/else`, or format keywords
- Custom validators accept a function, which is not serializable
- Coercion only converts between primitive types (string ↔ number, string ↔ boolean)

## Composability
Connections to other Radzor components will be defined in a separate pass.
