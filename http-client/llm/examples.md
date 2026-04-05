# @radzor/http-client — Usage Examples

## Example 1: Simple GET with base URL

```typescript
import { HttpClient } from "./components/http-client/src";

const client = new HttpClient({
  baseUrl: "https://jsonplaceholder.typicode.com",
  timeout: 5000,
});

const { status, data } = await client.get<{ id: number; title: string }>("/todos/1");
console.log(status); // 200
console.log(data.title); // "delectus aut autem"
```

## Example 2: POST with auth headers and retry logging

```typescript
import { HttpClient } from "./components/http-client/src";

const client = new HttpClient({
  baseUrl: "https://api.example.com",
  retries: 3,
  retryDelay: 500,
  headers: {
    Authorization: `Bearer ${process.env.API_KEY}`,
    "X-App-Version": "1.0.0",
  },
});

client.on("onRetry", ({ url, attempt, reason }) => {
  console.warn(`Retry ${attempt} on ${url} (${reason})`);
});

const { status, data } = await client.post("/orders", {
  productId: "sku-123",
  quantity: 2,
});

console.log(status, data);
```

## Example 3: GET with query params

```typescript
import { HttpClient } from "./components/http-client/src";

const client = new HttpClient({ baseUrl: "https://api.example.com" });

const { data } = await client.request("GET", "/users", {
  params: { page: "2", limit: "20", role: "admin" },
  headers: { Accept: "application/json" },
});

// Resolves to: GET https://api.example.com/users?page=2&limit=20&role=admin
console.log(data);
```

## Example 4: PUT and DELETE operations

```typescript
import { HttpClient } from "./components/http-client/src";

const client = new HttpClient({ baseUrl: "https://api.example.com/v1" });

// Update a resource
const { status: updateStatus } = await client.put("/users/42", {
  name: "Alice Updated",
  email: "alice@example.com",
});
console.log("Updated:", updateStatus); // 200

// Delete a resource
const { status: deleteStatus } = await client.delete("/users/42");
console.log("Deleted:", deleteStatus); // 204
```

## Example 5: Full observability with all events

```typescript
import { HttpClient } from "./components/http-client/src";

const client = new HttpClient({
  baseUrl: "https://unstable-api.example.com",
  retries: 2,
  retryDelay: 1000,
  timeout: 8000,
});

client.on("onRequest", ({ method, url, attempt }) => {
  console.log(`[${new Date().toISOString()}] ${method} ${url} (attempt ${attempt})`);
});

client.on("onResponse", ({ status, durationMs }) => {
  console.log(`Response: ${status} in ${durationMs}ms`);
});

client.on("onRetry", ({ attempt, reason }) => {
  console.warn(`Retrying (${attempt}): ${reason}`);
});

client.on("onError", ({ code, message }) => {
  console.error(`Failed [${code}]: ${message}`);
});

try {
  const { data } = await client.get("/health");
  console.log("Healthy:", data);
} catch {
  console.error("Service unreachable after retries");
}
```
