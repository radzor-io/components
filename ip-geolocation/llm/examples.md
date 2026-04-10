# @radzor/ip-geolocation — Usage Examples

## Single IP lookup
```typescript
import { IpGeolocation } from "@radzor/ip-geolocation";

const geo = new IpGeolocation({ cacheTtl: 3600000 });

const result = await geo.lookup("8.8.8.8");
console.log(result.country);     // "United States"
console.log(result.countryCode); // "US"
console.log(result.city);        // "Mountain View"
console.log(result.region);      // "California"
console.log(result.lat, result.lng); // 37.4056, -122.0775
console.log(result.timezone);    // "America/Los_Angeles"
console.log(result.isp);         // "Google LLC"
```

## Bulk IP lookup
```typescript
const ips = ["8.8.8.8", "1.1.1.1", "208.67.222.222"];
const results = await geo.bulkLookup(ips);

for (const r of results) {
  console.log(`${r.ip}: ${r.city}, ${r.country} (${r.isp})`);
}
// 8.8.8.8: Mountain View, United States (Google LLC)
// 1.1.1.1: Los Angeles, United States (Cloudflare, Inc.)
// 208.67.222.222: San Francisco, United States (OpenDNS, LLC)
```

## Express middleware for geo-aware requests
```typescript
app.use(async (req, res, next) => {
  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim()
    ?? req.socket.remoteAddress
    ?? "";

  try {
    req.geo = await geo.lookup(ip);
  } catch {
    req.geo = null;
  }
  next();
});

app.get("/api/content", (req, res) => {
  if (req.geo?.countryCode === "DE") {
    res.json({ content: "German-specific content", lang: "de" });
  } else {
    res.json({ content: "Default content", lang: "en" });
  }
});
```

## Geo-based access control
```typescript
const BLOCKED_COUNTRIES = ["XX", "YY"]; // hypothetical country codes

app.use(async (req, res, next) => {
  const ip = req.ip ?? "";
  try {
    const geo = await geoService.lookup(ip);
    if (BLOCKED_COUNTRIES.includes(geo.countryCode)) {
      return res.status(403).json({ error: "Access restricted in your region" });
    }
  } catch {
    // Allow access if geo lookup fails
  }
  next();
});
```

## Analytics: visitor country breakdown
```typescript
app.post("/api/track", async (req, res) => {
  const ip = req.ip ?? "";
  try {
    const result = await geo.lookup(ip);
    await db.analytics.create({
      event: req.body.event,
      country: result.country,
      countryCode: result.countryCode,
      city: result.city,
      timezone: result.timezone,
    });
  } catch {
    // Track without geo data
    await db.analytics.create({ event: req.body.event });
  }
  res.sendStatus(200);
});
```

## Event monitoring and cache stats
```typescript
geo.on("onLookup", ({ ip, country, cached }) => {
  console.log(`${ip} → ${country} (${cached ? "cache hit" : "API call"})`);
});

geo.on("onError", ({ ip, message }) => {
  console.error(`Geo lookup failed for ${ip}: ${message}`);
});

// Check cache size periodically
setInterval(() => {
  console.log(`Geo cache entries: ${geo.cacheSize}`);
}, 60000);
```

---

## Python Examples

### Single lookup
```python
from ip_geolocation import IpGeolocation

geo = IpGeolocation(cache_ttl=3600000)

result = geo.lookup("8.8.8.8")
print(f"{result.city}, {result.country}")  # "Mountain View, United States"
print(f"Coordinates: {result.lat}, {result.lng}")
print(f"Timezone: {result.timezone}")
```

### Bulk lookup
```python
results = geo.bulk_lookup(["8.8.8.8", "1.1.1.1", "208.67.222.222"])
for r in results:
    print(f"{r.ip}: {r.city}, {r.country}")
```

### Django middleware
```python
class GeoMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response
        self.geo = IpGeolocation()

    def __call__(self, request):
        ip = request.META.get("HTTP_X_FORWARDED_FOR", "").split(",")[0].strip()
        ip = ip or request.META.get("REMOTE_ADDR", "")
        try:
            request.geo = self.geo.lookup(ip)
        except Exception:
            request.geo = None
        return self.get_response(request)
```

### FastAPI with geo-based responses
```python
from fastapi import FastAPI, Request

app = FastAPI()
geo = IpGeolocation()

@app.get("/api/localized")
async def localized(request: Request):
    ip = request.client.host
    try:
        result = geo.lookup(ip)
        return {"country": result.country, "timezone": result.timezone}
    except Exception:
        return {"country": "unknown", "timezone": "UTC"}
```
