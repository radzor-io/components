# How to integrate @radzor/ip-geolocation

## Overview
Look up geographic data from IP addresses using the free ip-api.com service. Get country, city, coordinates, timezone, ISP, and organization info for single or bulk IP lookups. Includes built-in caching and rate limiting.

## Integration Steps

### TypeScript

1. **Import and configure**:
```typescript
import { IpGeolocation } from "@radzor/ip-geolocation";

const geo = new IpGeolocation({
  cacheTtl: 3600000, // 1 hour cache
  lang: "en",
});
```

2. **Single IP lookup**:
```typescript
const result = await geo.lookup("8.8.8.8");
console.log(result.country);     // "United States"
console.log(result.city);        // "Mountain View"
console.log(result.lat, result.lng); // 37.4056, -122.0775
console.log(result.timezone);    // "America/Los_Angeles"
```

3. **Bulk lookup** (up to 100 IPs):
```typescript
const results = await geo.bulkLookup(["8.8.8.8", "1.1.1.1", "208.67.222.222"]);
for (const r of results) {
  console.log(`${r.ip}: ${r.city}, ${r.country}`);
}
```

4. **Listen for events**:
```typescript
geo.on("onLookup", ({ ip, country, cached }) => {
  console.log(`${ip} → ${country} (${cached ? "cached" : "fetched"})`);
});

geo.on("onError", ({ ip, message }) => {
  console.error(`Lookup failed for ${ip}: ${message}`);
});
```

5. **Use in Express middleware**:
```typescript
app.use(async (req, res, next) => {
  const ip = req.ip ?? req.socket.remoteAddress ?? "";
  try {
    req.geo = await geo.lookup(ip);
  } catch {
    req.geo = null;
  }
  next();
});
```

### Python

1. **Configure**:
```python
from ip_geolocation import IpGeolocation

geo = IpGeolocation(cache_ttl=3600000, lang="en")
```

2. **Lookup**:
```python
result = geo.lookup("8.8.8.8")
print(f"{result.city}, {result.country} ({result.lat}, {result.lng})")
```

3. **Bulk lookup**:
```python
results = geo.bulk_lookup(["8.8.8.8", "1.1.1.1"])
for r in results:
    print(f"{r.ip}: {r.city}, {r.country}")
```

## Environment Variables Required
- None. The free ip-api.com service requires no API key.

## Constraints
- Uses the free ip-api.com service: limited to 45 requests/minute (HTTP only, no HTTPS on free tier).
- Built-in rate limiter automatically throttles requests to stay within limits.
- For production/commercial use, consider a paid plan or self-hosted MaxMind GeoIP database.
- Bulk lookups are limited to 100 IPs per batch.
- Results are cached in-memory (not persistent across restarts).
- Private/reserved IP addresses (10.x.x.x, 192.168.x.x, etc.) will fail lookup.

## Composability
- Geo results can be used with `@radzor/feature-flag` for region-based feature gating.
- IP + country data can feed into `@radzor/rate-limiter` for geo-aware rate limiting.
