# @radzor/user-segmentation — Usage Examples

## Define segments and evaluate users
```typescript
import { UserSegmentation } from "@radzor/user-segmentation";

const seg = new UserSegmentation();

seg.defineSegment("enterprise", "Enterprise Users", [
  { field: "plan", operator: "eq", value: "enterprise" },
  { field: "seats", operator: "gte", value: 10 },
]);

seg.defineSegment("churning", "Churning Users", [
  { field: "daysSinceLastLogin", operator: "gt", value: 14 },
  { field: "plan", operator: "neq", value: "free" },
]);

const result = seg.evaluate("user_1", {
  plan: "enterprise",
  seats: 25,
  daysSinceLastLogin: 3,
});
console.log(result.matchedSegments); // ["enterprise"]
```

## Nested attributes
```typescript
const seg = new UserSegmentation();

seg.defineSegment("us-premium", "US Premium", [
  { field: "address.country", operator: "eq", value: "US" },
  { field: "subscription.tier", operator: "in", value: ["gold", "platinum"] },
]);

seg.evaluate("user_2", {
  address: { country: "US", state: "CA" },
  subscription: { tier: "gold", renewsAt: "2025-06-01" },
});
```

## Regex and string operators
```typescript
const seg = new UserSegmentation();

seg.defineSegment("corporate-email", "Corporate Email Users", [
  { field: "email", operator: "regex", value: "^[^@]+@(?!gmail|yahoo|hotmail).*\\.com$" },
]);

seg.defineSegment("acme-employees", "Acme Employees", [
  { field: "email", operator: "endsWith", value: "@acme.com" },
]);

const result = seg.evaluate("user_3", { email: "bob@acme.com" });
console.log(result.matchedSegments); // ["corporate-email", "acme-employees"]
```

## Express middleware for segment-based personalization
```typescript
import express from "express";
import { UserSegmentation } from "@radzor/user-segmentation";

const app = express();
const seg = new UserSegmentation({
  segments: [
    {
      segmentId: "new-user",
      name: "New Users",
      rules: [{ field: "accountAgeDays", operator: "lt", value: 7 }],
    },
    {
      segmentId: "high-value",
      name: "High Value",
      rules: [{ field: "totalSpend", operator: "gte", value: 1000 }],
    },
  ],
});

app.use(async (req, res, next) => {
  if (req.user) {
    const result = seg.evaluate(req.user.id, {
      accountAgeDays: req.user.accountAgeDays,
      totalSpend: req.user.totalSpend,
      plan: req.user.plan,
    });
    req.userSegments = result.matchedSegments;
  }
  next();
});

app.get("/dashboard", (req, res) => {
  if (req.userSegments?.includes("new-user")) {
    res.render("dashboard-onboarding");
  } else {
    res.render("dashboard");
  }
});
```

## Listing and managing segments
```typescript
const seg = new UserSegmentation();

seg.defineSegment("trial", "Trial Users", [
  { field: "plan", operator: "eq", value: "trial" },
]);

seg.defineSegment("expired", "Expired Trials", [
  { field: "plan", operator: "eq", value: "trial" },
  { field: "trialDaysLeft", operator: "lte", value: 0 },
]);

const all = seg.listSegments();
console.log(`${all.length} segments defined`);

// Remove a segment
seg.removeSegment("expired");
```

---

## Python Examples

### Basic segmentation
```python
from user_segmentation import UserSegmentation

seg = UserSegmentation()
seg.define_segment("premium", "Premium Users", [
    {"field": "plan", "operator": "in", "value": ["pro", "enterprise"]},
    {"field": "active", "operator": "eq", "value": True},
])

result = seg.evaluate("user_1", {"plan": "pro", "active": True})
print(result.matched_segments)  # ["premium"]
```

### Django view with segmentation
```python
from user_segmentation import UserSegmentation

seg = UserSegmentation(segments=[
    {
        "segmentId": "vip",
        "name": "VIP",
        "rules": [{"field": "lifetime_value", "operator": "gte", "value": 5000}],
    },
])

def dashboard(request):
    result = seg.evaluate(str(request.user.id), {
        "lifetime_value": request.user.profile.lifetime_value,
        "plan": request.user.profile.plan,
    })
    context = {"segments": result.matched_segments}
    return render(request, "dashboard.html", context)
```

### Cached lookup
```python
seg = UserSegmentation()
seg.define_segment("active", "Active", [
    {"field": "last_login_days", "operator": "lt", "value": 7},
])

# First call evaluates and caches
seg.evaluate("user_1", {"last_login_days": 2})

# Later, retrieve cached result
cached = seg.get_user_segments("user_1")
print(cached)  # ["active"]
```
