# How to integrate @radzor/user-segmentation

## Overview
This component provides an in-memory rule engine for segmenting users based on their attributes. Define segments with filter rules (AND logic), evaluate users against all segments, and retrieve cached results. Supports nested attribute paths, 13 comparison operators, and zero dependencies.

## Integration Steps

1. **Install**: Copy `src/index.ts` into your project or import from the package.

2. **Create an instance with segment definitions**:
```typescript
import { UserSegmentation } from "@radzor/user-segmentation";

const segmentation = new UserSegmentation({
  segments: [
    {
      segmentId: "power-users",
      name: "Power Users",
      rules: [
        { field: "loginCount", operator: "gte", value: 50 },
        { field: "plan", operator: "in", value: ["pro", "enterprise"] },
      ],
    },
    {
      segmentId: "at-risk",
      name: "At Risk",
      rules: [
        { field: "daysSinceLastLogin", operator: "gt", value: 30 },
        { field: "plan", operator: "neq", value: "free" },
      ],
    },
  ],
});
```

3. **Evaluate a user**:
```typescript
const result = segmentation.evaluate("user_42", {
  loginCount: 120,
  plan: "pro",
  daysSinceLastLogin: 2,
  email: "alice@acme.com",
});
// result.matchedSegments → ["power-users"]
```

4. **Retrieve cached segments later**:
```typescript
const segments = segmentation.getUserSegments("user_42");
// → ["power-users"]
```

5. **Python equivalent**:
```python
class UserSegmentation:
    def __init__(self, segments=None):
        self.segments = {s["segmentId"]: s for s in (segments or [])}
        self.cache = {}

    def evaluate(self, user_id, attributes):
        matched = []
        for seg in self.segments.values():
            if all(self._eval_rule(attributes, r) for r in seg["rules"]):
                matched.append(seg["segmentId"])
        self.cache[user_id] = matched
        return {"userId": user_id, "matchedSegments": matched}

    def _eval_rule(self, attrs, rule):
        val = attrs.get(rule["field"])
        op = rule["operator"]
        expected = rule["value"]
        if op == "eq": return val == expected
        if op == "gte": return val >= expected
        # ... etc
```

## Environment Variables Required
No environment variables required.

## Constraints
- Rules within a segment are ANDed — all must match for the user to belong to the segment.
- Supported operators: `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `in`, `notIn`, `contains`, `startsWith`, `endsWith`, `exists`, `regex`.
- Nested attribute paths are supported (e.g. `"subscription.plan"`).
- The cache stores the last evaluation result per user; calling `evaluate()` overwrites the previous entry.
- All data is in-memory; segments and cache reset on process restart.

## Composability
- Use evaluation results to personalize content with `@radzor/feature-flag`.
- Pipe segment membership into `@radzor/event-tracker` as user traits for analytics enrichment.
- Combine with `@radzor/ab-test` to run experiments targeted at specific segments.
