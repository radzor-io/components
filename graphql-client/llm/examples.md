# @radzor/graphql-client — Usage Examples

## Basic query
```typescript
import { GraphQLClient } from "@radzor/graphql-client";

const client = new GraphQLClient({
  endpoint: "https://api.example.com/graphql",
  headers: { Authorization: "Bearer my-token" },
});

const result = await client.query(`
  query {
    users {
      id
      name
      email
    }
  }
`);

console.log(result.data); // { users: [{ id: "1", name: "Alice", ... }, ...] }
```

## Query with variables
```typescript
const client = new GraphQLClient({
  endpoint: "https://api.example.com/graphql",
});

interface UserData {
  user: { name: string; email: string; posts: { title: string }[] };
}

const result = await client.query<UserData>(`
  query GetUser($id: ID!) {
    user(id: $id) {
      name
      email
      posts { title }
    }
  }
`, { id: "42" });

if (result.data) {
  console.log(result.data.user.name);
  console.log(`Posts: ${result.data.user.posts.length}`);
}

if (result.errors) {
  for (const err of result.errors) {
    console.error(`GraphQL error: ${err.message}`);
  }
}
```

## Mutations
```typescript
const client = new GraphQLClient({
  endpoint: "https://api.example.com/graphql",
  headers: { Authorization: "Bearer admin-token" },
});

const result = await client.mutate(`
  mutation CreatePost($input: CreatePostInput!) {
    createPost(input: $input) {
      id
      title
      createdAt
    }
  }
`, {
  input: {
    title: "My New Post",
    body: "Content here...",
    published: true,
  },
});

console.log("Created:", result.data);
```

## Caching
```typescript
const client = new GraphQLClient({
  endpoint: "https://api.example.com/graphql",
  cacheEnabled: true,
  cacheTtlMs: 60000, // 1 minute
});

// First call: fetches from server
const r1 = await client.query("query { config { siteName theme } }");
console.log(r1.cached); // false

// Second call (within TTL): returns cached result
const r2 = await client.query("query { config { siteName theme } }");
console.log(r2.cached); // true

// Mutations automatically clear the cache
await client.mutate("mutation { updateConfig(theme: 'dark') { theme } }");

// Next query fetches fresh data
const r3 = await client.query("query { config { siteName theme } }");
console.log(r3.cached); // false
```

## Request batching
```typescript
const client = new GraphQLClient({
  endpoint: "https://api.example.com/graphql",
  batchEnabled: true,
  batchIntervalMs: 50, // Batch window: 50ms
});

// These concurrent queries are batched into a single HTTP request
const [users, posts, comments] = await Promise.all([
  client.query("query { users { id name } }"),
  client.query("query { posts { id title } }"),
  client.query("query { comments { id text } }"),
]);

console.log(users.data, posts.data, comments.data);
```

## Error handling
```typescript
const client = new GraphQLClient({
  endpoint: "https://api.example.com/graphql",
});

client.on("onError", ({ operation, message, status }) => {
  console.error(`[GraphQL ${operation}] HTTP ${status}: ${message}`);
});

try {
  await client.query("query { nonExistentField }");
} catch (err) {
  console.error("Request failed:", err);
}
```

---

## Python Examples

### Basic query
```python
import os
from graphql_client import GraphQLClient, GraphQLClientConfig

client = GraphQLClient(GraphQLClientConfig(
    endpoint="https://api.example.com/graphql",
    headers={"Authorization": f"Bearer {os.environ['API_TOKEN']}"},
))

result = client.query("""
    query {
        users { id name email }
    }
""")
print(result.data)
```

### Query with variables
```python
result = client.query("""
    query GetUser($id: ID!) {
        user(id: $id) { name email }
    }
""", variables={"id": "42"})
print(result.data["user"]["name"])
```

### Mutation
```python
result = client.mutate("""
    mutation CreatePost($title: String!, $body: String!) {
        createPost(title: $title, body: $body) { id title }
    }
""", variables={"title": "Hello", "body": "World"})
print(f"Created post: {result.data['createPost']['id']}")
```

### Error handling
```python
client.on("onError", lambda e: print(f"Error: {e['message']}"))

result = client.query("query { users { name } }")
if result.errors:
    for err in result.errors:
        print(f"GraphQL error: {err['message']}")
```
