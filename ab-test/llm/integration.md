# How to integrate @radzor/ab-test

## Overview
This component provides in-memory A/B testing with deterministic variant assignment (hash-based), conversion tracking, and basic statistical significance calculation. No external service required — define experiments in code and track conversions inline.

## Integration Steps

1. **Install**: Copy `src/index.ts` into your project or import from the package.

2. **Create an instance and define experiments**:
```typescript
import { ABTest } from "@radzor/ab-test";

const ab = new ABTest({ salt: "my-app-2024" });

ab.createExperiment("checkout-flow", ["control", "streamlined"], 100);
ab.createExperiment("pricing-page", ["original", "variant-a", "variant-b"], 50);
```

3. **Assign users to variants**:
```typescript
const assignment = ab.getVariant("checkout-flow", userId);

if (assignment.variant === "streamlined") {
  renderStreamlinedCheckout();
} else {
  renderDefaultCheckout();
}
```

4. **Track conversions**:
```typescript
ab.trackConversion("checkout-flow", userId, orderTotal);
```

5. **Check results**:
```typescript
const results = ab.getResults("checkout-flow");
console.log(`Significant: ${results.significant}`);
for (const v of results.variants) {
  console.log(`${v.variant}: ${(v.conversionRate * 100).toFixed(1)}% (${v.conversions}/${v.participants})`);
}
```

6. **Python equivalent**:
```python
class ABTest:
    def __init__(self, salt="radzor-ab"):
        self.salt = salt
        self.experiments = {}
        self.assignments = {}

    def get_variant(self, experiment_id, user_id):
        key = f"{self.salt}:{experiment_id}:{user_id}"
        hash_val = hash(key) % len(self.experiments[experiment_id]["variants"])
        return self.experiments[experiment_id]["variants"][hash_val]

    def track_conversion(self, experiment_id, user_id, value=1):
        variant = self.get_variant(experiment_id, user_id)
        # Store conversion...
```

## Environment Variables Required
No environment variables required. Configuration is done in code.

## Constraints
- Variant assignment uses a deterministic djb2 hash — the same `(salt + experimentId + userId)` always yields the same variant.
- All data is in-memory; assignments and conversions reset on process restart.
- Statistical significance uses a chi-squared test and requires at least 30 participants per variant.
- For persistent experiments, store the assignment and conversion data in a database.
- Traffic allocation determines what percentage of users enter the experiment; excluded users get the first variant (control).

## Composability
- Use `@radzor/event-tracker` to forward conversion events to an external analytics service.
- Combine with `@radzor/feature-flag` to gate experiment participation by feature flag.
