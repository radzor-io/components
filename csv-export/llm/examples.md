# csv-export — Examples

## Generate CSV from objects

### TypeScript

```typescript
import { CsvExport } from "./components/csv-export/src";

const csv = new CsvExport();
const output = csv.generate([
  { name: "Alice", email: "alice@example.com", role: "admin" },
  { name: "Bob", email: "bob@example.com", role: "user" },
]);
console.log(output);
// name,email,role
// Alice,alice@example.com,admin
// Bob,bob@example.com,user
```

### Python

```python
from components.csv_export.src import CsvExport

csv = CsvExport()
output = csv.generate([
    {"name": "Alice", "email": "alice@example.com", "role": "admin"},
    {"name": "Bob", "email": "bob@example.com", "role": "user"},
])
print(output)
```

## Generate from arrays

### TypeScript

```typescript
const output = csv.generateFromArrays(
  ["Product", "Price", "Stock"],
  [
    ["Widget", "9.99", "100"],
    ["Gadget", "24.99", "50"],
  ]
);
```

### Python

```python
output = csv.generate_from_arrays(
    ["Product", "Price", "Stock"],
    [["Widget", "9.99", "100"], ["Gadget", "24.99", "50"]],
)
```

## Parse CSV

### TypeScript

```typescript
const data = csv.parse("name,age\nAlice,30\nBob,25");
console.log(data);
// [{ name: "Alice", age: "30" }, { name: "Bob", age: "25" }]
```

### Python

```python
data = csv.parse("name,age\nAlice,30\nBob,25")
print(data)
# [{"name": "Alice", "age": "30"}, {"name": "Bob", "age": "25"}]
```

## Write to file

### TypeScript

```typescript
csv.toFile("./output/users.csv", [
  { name: "Alice", age: "30" },
  { name: "Bob", age: "25" },
]);
```

### Python

```python
csv.to_file("./output/users.csv", [
    {"name": "Alice", "age": "30"},
    {"name": "Bob", "age": "25"},
])
```

## Semicolon delimiter (European format)

### TypeScript

```typescript
const csv = new CsvExport({ delimiter: ";" });
const output = csv.generate([{ price: "1.234,56", item: "Widget" }]);
// price;item
// 1.234,56;Widget
```

### Python

```python
from components.csv_export.src import CsvExport, CsvConfig

csv = CsvExport(CsvConfig(delimiter=";"))
output = csv.generate([{"price": "1.234,56", "item": "Widget"}])
```

## Fields with special characters

### TypeScript

```typescript
const output = csv.generate([
  { name: 'O"Brien', city: "New York, NY", bio: "Line1\nLine2" },
]);
// name,city,bio
// "O""Brien","New York, NY","Line1\nLine2"
```
