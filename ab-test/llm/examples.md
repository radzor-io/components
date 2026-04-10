# @radzor/ab-test — Usage Examples

## Basic two-variant experiment
```typescript
import { ABTest } from "@radzor/ab-test";

const ab = new ABTest();
ab.createExperiment("hero-banner", ["control", "new-design"]);

const { variant } = ab.getVariant("hero-banner", req.user.id);
if (variant === "new-design") {
  res.render("hero-new");
} else {
  res.render("hero-default");
}
```

## Multi-variant with traffic allocation
```typescript
const ab = new ABTest({ salt: "prod-2024" });

// Only 30% of users enter the experiment
ab.createExperiment("pricing", ["monthly", "annual", "lifetime"], 30);

const assignment = ab.getVariant("pricing", userId);
if (!assignment.inExperiment) {
  // 70% of users see default (first variant)
  showMonthlyPricing();
} else {
  switch (assignment.variant) {
    case "annual":   showAnnualPricing();   break;
    case "lifetime": showLifetimePricing(); break;
    default:         showMonthlyPricing();  break;
  }
}
```

## Tracking conversions with revenue
```typescript
const ab = new ABTest();
ab.createExperiment("checkout-flow", ["control", "one-click"]);

// On page load
const { variant } = ab.getVariant("checkout-flow", userId);

// On purchase
ab.trackConversion("checkout-flow", userId, order.total);
```

## Reading experiment results
```typescript
const results = ab.getResults("checkout-flow");

console.log(`Total participants: ${results.totalParticipants}`);
console.log(`Statistically significant: ${results.significant}`);

for (const v of results.variants) {
  console.log(
    `${v.variant}: ${v.participants} users, ` +
    `${v.conversions} conversions (${(v.conversionRate * 100).toFixed(1)}%), ` +
    `avg value: $${v.avgValue.toFixed(2)}`
  );
}
```

## Listening for conversion events
```typescript
const ab = new ABTest();
ab.createExperiment("signup-flow", ["control", "simplified"]);

ab.on("onConversion", ({ experimentId, variant, userId, value }) => {
  console.log(`[${experimentId}] ${userId} converted in "${variant}" (value: ${value})`);
  // Forward to analytics
  analytics.track("experiment_conversion", { experimentId, variant, value });
});

ab.trackConversion("signup-flow", "user_99", 1);
```

## Predefined experiments via config
```typescript
const ab = new ABTest({
  salt: "my-app",
  experiments: [
    { experimentId: "cta-color", variants: ["blue", "green", "orange"], trafficPercent: 100 },
    { experimentId: "onboarding", variants: ["control", "guided"], trafficPercent: 50 },
  ],
});

// No need to call createExperiment — they're ready to use
const { variant } = ab.getVariant("cta-color", userId);
```

---

## Python Examples

### Basic experiment
```python
from ab_test import ABTest

ab = ABTest(salt="my-app")
ab.create_experiment("hero-banner", ["control", "redesign"])

variant = ab.get_variant("hero-banner", user_id)
if variant.variant == "redesign":
    render_new_hero()
```

### Tracking and results
```python
ab = ABTest()
ab.create_experiment("checkout", ["control", "one-click"])

# Assign and track
ab.get_variant("checkout", "user_42")
ab.track_conversion("checkout", "user_42", value=29.99)

# Get results
results = ab.get_results("checkout")
for v in results.variants:
    print(f"{v.variant}: {v.conversion_rate:.1%} ({v.conversions}/{v.participants})")
```

### Django middleware
```python
from ab_test import ABTest

ab = ABTest(salt="django-app")
ab.create_experiment("nav-layout", ["sidebar", "topbar"])

class ABTestMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.user.is_authenticated:
            assignment = ab.get_variant("nav-layout", str(request.user.id))
            request.ab_variant = assignment.variant
        return self.get_response(request)
```
