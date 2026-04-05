# How to integrate @radzor/http-client

## Overview

A general-purpose HTTP client with automatic retry on 5xx errors and network failures, configurable timeout via `AbortController`, and lifecycle events for observability. Works in Node.js 18+ and modern browsers.

## Integration Steps

1. Install with `radzor add http-client`.
2. Instantiate `HttpClient` with optional `baseUrl`, `timeout`, `retries`, `retryDelay`, and default `headers`.
3. Optionally subscribe to `onRequest`, `onResponse`, `onRetry`, and `onError` for logging and metrics.
4. Call `get()`, `post()`, `put()`, or `delete()` for common verbs. Use `request()` for full control including custom method, query params, and per-request timeout overrides.
5. Parse the typed response — JSON responses are automatically deserialized; text responses are returned as strings.

```typescript
import { HttpClient } from "./components/http-client/src";

const client = new HttpClient({
  baseUrl: "https://api.example.com",
  timeout: 10000,
  retries: 3,
  headers: { Authorization: `Bearer ${process.env.API_KEY}` },
});

client.on("onRetry", ({ url, attempt, reason }) => {
  console.warn(`Retry ${attempt} for ${url}: ${reason}`);
});

const { status, data } = await client.get("/users/123");
```

## Constraints

- Retries are only triggered on HTTP 5xx responses and network/timeout errors. 4xx responses are returned immediately without retrying.
- Retry delay uses exponential backoff: `retryDelay * 2^(attempt-1)`. With `retryDelay: 1000` and 3 retries, the delays are 1s, 2s, 4s.
- `timeout` controls the per-attempt deadline, not the total request time including retries.
- Requires Node.js 18+ (native fetch) or a browser environment with fetch support.
- `params` values in `RequestOptions` are appended as a URL query string and must be string values.

## Composability

Use as a foundation for higher-level API clients (e.g., `@radzor/github-bot` could use this internally). Combine `onRetry` and `onError` events with `@radzor/event-bus` to broadcast failure signals. Wrap with `@radzor/rate-limiter` to respect upstream API quotas.
