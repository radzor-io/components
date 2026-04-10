# @radzor/json-transform — Usage Examples

## Field mapping between schemas
```typescript
import { JsonTransform } from "@radzor/json-transform";

const jt = new JsonTransform();

const apiResponse = {
  data: {
    id: 42,
    attributes: {
      first_name: "Alice",
      last_name: "Smith",
      contact: { email: "alice@example.com", phone: "+1234567890" },
    },
    relationships: { org: { name: "Acme Corp" } },
  },
};

const user = jt.map(apiResponse, {
  "id": "data.id",
  "firstName": "data.attributes.first_name",
  "lastName": "data.attributes.last_name",
  "email": "data.attributes.contact.email",
  "company": "data.relationships.org.name",
});
console.log(user);
// { id: 42, firstName: "Alice", lastName: "Smith", email: "alice@example.com", company: "Acme Corp" }
```

## Rule-based transformation pipeline
```typescript
const jt = new JsonTransform();

const input = {
  name: "Widget",
  price: 29.99,
  sku: "WDG-001",
  internal_notes: "Discontinued soon",
  stock: 150,
  category: "gadgets",
};

const result = jt.transform(input, [
  { op: "omit", fields: ["internal_notes", "sku"] },
  { op: "rename", from: "price", to: "unitPrice" },
  { op: "set", path: "currency", value: "USD" },
  { op: "compute", path: "inStock", fn: (_val, root) => (root as any).stock > 0 },
]);

console.log(result.data);
// { name: "Widget", unitPrice: 29.99, stock: 150, category: "gadgets", currency: "USD", inStock: true }
console.log(result.metadata);
// { inputKeys: 5, outputKeys: 6, transformations: 4 }
```

## Filtering arrays
```typescript
const jt = new JsonTransform();

const orders = [
  { id: 1, total: 150, status: "shipped", customer: "Alice" },
  { id: 2, total: 30, status: "pending", customer: "Bob" },
  { id: 3, total: 500, status: "shipped", customer: "Charlie" },
  { id: 4, total: 75, status: "cancelled", customer: "Diana" },
];

// Filter by status
const shipped = jt.filter(orders, { field: "status", operator: "eq", value: "shipped" });
// [{ id: 1, ... }, { id: 3, ... }]

// Filter by total > 100
const highValue = jt.filter(orders, { field: "total", operator: "gt", value: 100 });
// [{ id: 1, ... }, { id: 3, ... }]

// Filter by customer name starting with "A"
const aCustomers = jt.filter(orders, { field: "customer", operator: "startsWith", value: "A" });
// [{ id: 1, ... }]
```

## Flattening nested objects
```typescript
const jt = new JsonTransform();

const nested = {
  user: {
    name: "Alice",
    address: {
      street: "123 Main St",
      city: "Springfield",
      state: "IL",
    },
    tags: ["admin", "verified"],
  },
  metadata: { version: 2 },
};

const flat = jt.flatten(nested);
console.log(flat);
// {
//   "user.name": "Alice",
//   "user.address.street": "123 Main St",
//   "user.address.city": "Springfield",
//   "user.address.state": "IL",
//   "user.tags.0": "admin",
//   "user.tags.1": "verified",
//   "metadata.version": 2,
// }
```

## Deep merging objects
```typescript
const jt = new JsonTransform();

const defaults = {
  theme: { color: "blue", fontSize: 14 },
  features: ["search"],
  version: 1,
};

const userPrefs = {
  theme: { color: "red", darkMode: true },
  features: ["export"],
  locale: "en-US",
};

const merged = jt.merge([defaults, userPrefs]);
console.log(merged);
// {
//   theme: { color: "red", fontSize: 14, darkMode: true },
//   features: ["search", "export"],
//   version: 1,
//   locale: "en-US",
// }
```

## Strict mode for validation
```typescript
const jt = new JsonTransform({ strictMode: true });

try {
  jt.map({ name: "Alice" }, { email: "contact.email" });
} catch (err) {
  console.error(err.message); // 'Path "contact.email" not found in source data'
}
```

---

## Python Examples

### Field mapping
```python
from json_transform import JsonTransform

jt = JsonTransform()

api_data = {
    "data": {
        "id": 42,
        "attributes": {"first_name": "Alice", "email": "alice@example.com"},
    }
}

user = jt.map(api_data, {
    "id": "data.id",
    "name": "data.attributes.first_name",
    "email": "data.attributes.email",
})
print(user)  # {"id": 42, "name": "Alice", "email": "alice@example.com"}
```

### Filtering
```python
orders = [
    {"id": 1, "total": 150, "status": "shipped"},
    {"id": 2, "total": 30, "status": "pending"},
]

shipped = jt.filter(orders, {"field": "status", "operator": "eq", "value": "shipped"})
print(shipped)  # [{"id": 1, "total": 150, "status": "shipped"}]
```

### Flattening
```python
nested = {"user": {"name": "Alice", "address": {"city": "Springfield"}}}
flat = jt.flatten(nested)
print(flat)  # {"user.name": "Alice", "user.address.city": "Springfield"}
```

### Merging
```python
merged = jt.merge([
    {"theme": {"color": "blue"}, "v": 1},
    {"theme": {"color": "red", "dark": True}},
])
print(merged)  # {"theme": {"color": "red", "dark": True}, "v": 1}
```
