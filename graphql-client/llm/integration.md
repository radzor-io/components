# How to integrate @radzor/graphql-client

## Overview
Lightweight GraphQL client with query/mutation execution, in-memory response caching, automatic request batching, and WebSocket-based subscriptions. Zero dependencies — uses native `fetch` for HTTP and `WebSocket` for subscriptions. Follows the `graphql-transport-ws` protocol.

## Integration Steps

### TypeScript

1. **Import and create a client:**
```typescript
import { GraphQLClient } from "@radzor/graphql-client";

const client = new GraphQLClient({
  endpoint: "https://api.example.com/graphql",
  headers: { Authorization: `Bearer ${process.env.API_TOKEN}` },
  cacheEnabled: true,
  cacheTtlMs: 30000,
});
```

2. **Execute a query:**
```typescript
const result = await client.query(`
  query GetUser($id: ID!) {
    user(id: $id) {
      name
      email
      role
    }
  }
`, { id: "123" });

console.log(result.data);   // { user: { name: "Alice", email: "...", role: "admin" } }
console.log(result.cached); // false (first call)
```

3. **Execute a mutation:**
```typescript
const result = await client.mutate(`
  mutation UpdateUser($id: ID!, $name: String!) {
    updateUser(id: $id, name: $name) {
      id
      name
    }
  }
`, { id: "123", name: "Alice Updated" });
```

4. **Subscribe to events:**
```typescript
const sub = client.subscribe(`
  subscription OnMessage($roomId: ID!) {
    messageAdded(roomId: $roomId) {
      id
      text
      sender
    }
  }
`, { roomId: "room-1" }, (data) => {
  console.log("New message:", data);
});

// Later: sub.unsubscribe();
```

### Python

1. **Create and query:**
```python
from graphql_client import GraphQLClient, GraphQLClientConfig

client = GraphQLClient(GraphQLClientConfig(
    endpoint="https://api.example.com/graphql",
    headers={"Authorization": f"Bearer {os.environ['API_TOKEN']}"},
))

result = client.query("query { users { name email } }")
print(result.data)
```

## Environment Variables Required
None required by the component itself. Your GraphQL API may require authentication tokens.

## Constraints
- Uses native `fetch` — requires Node.js 18+ or browser environment
- Subscriptions use the `graphql-transport-ws` protocol (not legacy `subscriptions-transport-ws`)
- In-memory caching only — cleared on process restart or when mutations are executed
- Batching requires server-side support for array-of-operations format
- WebSocket reconnects automatically on connection loss with a 3-second delay

## Composability
Connections to other Radzor components will be defined in a separate pass.
