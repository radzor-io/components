# @radzor/data-validator — Usage Examples

## Basic schema validation
```typescript
import { DataValidator } from "@radzor/data-validator";

const validator = new DataValidator();

validator.addSchema("product", {
  type: "object",
  required: ["name", "price", "category"],
  properties: {
    name: { type: "string", minLength: 1, maxLength: 200 },
    price: { type: "number", minimum: 0 },
    category: { type: "string", enum: ["electronics", "clothing", "food", "other"] },
    tags: { type: "array", items: { type: "string", maxLength: 30 } },
    inStock: { type: "boolean" },
  },
});

const result = validator.validate({
  name: "Wireless Mouse",
  price: 29.99,
  category: "electronics",
  tags: ["peripheral", "wireless"],
  inStock: true,
}, "product");

console.log(result.valid); // true
console.log(result.errors); // []
```

## Handling validation errors
```typescript
const validator = new DataValidator({ allErrors: true });

validator.addSchema("user", {
  type: "object",
  required: ["name", "email", "age"],
  properties: {
    name: { type: "string", minLength: 1 },
    email: { type: "string", pattern: "^[^@]+@[^@]+\\.[^@]+$" },
    age: { type: "number", minimum: 0, maximum: 150 },
  },
});

const result = validator.validate({
  name: "",
  email: "not-valid",
  age: -5,
}, "user");

console.log(result.valid); // false
for (const err of result.errors) {
  console.log(`${err.path}: [${err.rule}] ${err.message}`);
}
// /name: [minLength] String length 0 is less than minimum 1
// /email: [pattern] String does not match pattern "^[^@]+@[^@]+\.[^@]+$"
// /age: [minimum] Value -5 is less than minimum 0
```

## Type coercion
```typescript
const validator = new DataValidator({ coerceTypes: true });

validator.addSchema("config", {
  type: "object",
  properties: {
    port: { type: "number" },
    debug: { type: "boolean" },
    name: { type: "string" },
  },
});

// String values from env vars / form data
const result = validator.validate({
  port: "3000",     // string → number
  debug: "true",    // string → boolean
  name: "my-app",   // already correct
}, "config");

console.log(result.valid); // true
console.log(result.coerced);
// { port: 3000, debug: true, name: "my-app" }
```

## Inline schemas (no registration needed)
```typescript
const validator = new DataValidator();

const result = validator.validate("hello@example.com", {
  type: "string",
  pattern: "^[^@]+@[^@]+\\.[^@]+$",
  minLength: 5,
  maxLength: 254,
});

console.log(result.valid); // true
```

## Custom validators
```typescript
const validator = new DataValidator();

validator.addSchema("password", {
  type: "string",
  minLength: 8,
  maxLength: 128,
  custom: (value: unknown, path: string) => {
    const s = value as string;
    if (!/[A-Z]/.test(s)) return "Must contain at least one uppercase letter";
    if (!/[a-z]/.test(s)) return "Must contain at least one lowercase letter";
    if (!/[0-9]/.test(s)) return "Must contain at least one digit";
    if (!/[^a-zA-Z0-9]/.test(s)) return "Must contain at least one special character";
    return null;
  },
});

const weak = validator.validate("password", "password");
console.log(weak.valid);  // false
console.log(weak.errors[0].message); // "Must contain at least one uppercase letter"

const strong = validator.validate("P@ssw0rd!", "password");
console.log(strong.valid); // true
```

## Standalone coercion
```typescript
const validator = new DataValidator();

const result = validator.coerce(
  { age: "25", active: "true", score: "3.14" },
  {
    type: "object",
    properties: {
      age: { type: "number" },
      active: { type: "boolean" },
      score: { type: "number" },
    },
  }
);

console.log(result.data);    // { age: 25, active: true, score: 3.14 }
console.log(result.coerced);  // true
console.log(result.changes);  // ["/age: string → number", "/active: string → boolean (true)", "/score: string → number"]
```

---

## Python Examples

### Basic validation
```python
from data_validator import DataValidator

validator = DataValidator()

validator.add_schema("user", {
    "type": "object",
    "required": ["name", "email"],
    "properties": {
        "name": {"type": "string", "minLength": 1},
        "email": {"type": "string", "pattern": r"^[^@]+@[^@]+\.[^@]+$"},
        "age": {"type": "number", "minimum": 0},
    },
})

result = validator.validate({"name": "Alice", "email": "alice@example.com"}, "user")
print(f"Valid: {result.valid}")  # Valid: True
```

### Error details
```python
result = validator.validate({"name": "", "email": "bad"}, "user")
for err in result.errors:
    print(f"{err['path']}: {err['message']}")
```

### Type coercion
```python
validator = DataValidator(DataValidatorConfig(coerce_types=True))
result = validator.validate({"port": "3000", "debug": "true"}, {
    "type": "object",
    "properties": {
        "port": {"type": "number"},
        "debug": {"type": "boolean"},
    },
})
print(result.coerced)  # {"port": 3000, "debug": True}
```

### Listing schemas
```python
validator.add_schema("config", {"type": "object"})
validator.add_schema("user", {"type": "object"})
print(validator.list_schemas())  # ["config", "user"]
```
