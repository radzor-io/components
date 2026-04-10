# How to integrate @radzor/funnel-report

## Overview
This component lets you define ordered conversion funnels, record user progression through each step, and generate reports with per-step conversion rates, dropoff analysis, and overall conversion. All data is in-memory; no external dependencies.

## Integration Steps

1. **Install**: Copy `src/index.ts` into your project or import from the package.

2. **Create a funnel with predefined steps**:
```typescript
import { FunnelReporter } from "@radzor/funnel-report";

const funnel = new FunnelReporter({
  funnelId: "signup-flow",
  steps: ["visit", "signup_start", "email_verified", "profile_complete"],
  windowMs: 7 * 24 * 60 * 60 * 1000, // 7-day window
});
```

3. **Record user progression**:
```typescript
funnel.recordStep(userId, "visit");
// ...later...
funnel.recordStep(userId, "signup_start");
funnel.recordStep(userId, "email_verified");
funnel.recordStep(userId, "profile_complete");
```

4. **Generate a report**:
```typescript
const report = funnel.getReport();

for (const step of report.steps) {
  console.log(
    `${step.stepName}: ${step.users} users, ` +
    `${(step.conversionFromPrevious * 100).toFixed(1)}% from previous`
  );
}
console.log(`Overall conversion: ${(report.overallConversion * 100).toFixed(1)}%`);
```

5. **Python equivalent**:
```python
class FunnelReporter:
    def __init__(self, funnel_id, steps=None, window_ms=86400000):
        self.funnel_id = funnel_id
        self.steps = steps or []
        self.window_ms = window_ms
        self.user_data = {}  # user_id -> [{"step": ..., "ts": ...}]

    def record_step(self, user_id, step_name):
        if user_id not in self.user_data:
            self.user_data[user_id] = []
        self.user_data[user_id].append({"step": step_name, "ts": time.time()})

    def get_report(self):
        # Count users per step (strict funnel)
        ...
```

## Environment Variables Required
No environment variables required.

## Constraints
- Strict funnel: a user counts for step N only if they completed all steps 0 through N in order.
- Steps must be defined before recording (via constructor or `defineStep()`).
- The `windowMs` parameter defines the maximum age of step entries; older entries are excluded from reports.
- All data is in-memory; resets on process restart.
- Duplicate step completions by the same user are ignored.

## Composability
- Feed `@radzor/event-tracker` events into funnel steps to automatically track user progression.
- Use report data with `@radzor/ab-test` to measure funnel improvements across experiment variants.
