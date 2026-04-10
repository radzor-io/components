# @radzor/funnel-report — Usage Examples

## E-commerce checkout funnel
```typescript
import { FunnelReporter } from "@radzor/funnel-report";

const checkout = new FunnelReporter({
  funnelId: "checkout",
  steps: ["product_view", "add_to_cart", "begin_checkout", "payment_entered", "order_placed"],
});

// Record events as they happen
checkout.recordStep("user_1", "product_view");
checkout.recordStep("user_1", "add_to_cart");
checkout.recordStep("user_2", "product_view");
checkout.recordStep("user_1", "begin_checkout");

const report = checkout.getReport();
// user_1 reached step 3, user_2 only step 1
console.log(`Overall: ${(report.overallConversion * 100).toFixed(1)}%`);
```

## SaaS onboarding funnel
```typescript
const onboarding = new FunnelReporter({
  funnelId: "onboarding",
  steps: ["signup", "verify_email", "create_workspace", "invite_team", "first_project"],
  windowMs: 14 * 24 * 60 * 60 * 1000, // 14-day window
});

// In signup handler
onboarding.recordStep(userId, "signup");

// In email verification callback
onboarding.recordStep(userId, "verify_email");

// Build a dashboard report
app.get("/admin/onboarding", (req, res) => {
  const report = onboarding.getReport();
  res.json(report);
});
```

## Dynamic step definition
```typescript
const funnel = new FunnelReporter({ funnelId: "custom" });

// Define steps at runtime
funnel.defineStep("landing_page");
funnel.defineStep("feature_click");
funnel.defineStep("trial_start");
funnel.defineStep("paid_conversion");

funnel.recordStep("user_a", "landing_page");
funnel.recordStep("user_a", "feature_click");
funnel.recordStep("user_a", "trial_start");
// user_a dropped off before paid_conversion

const report = funnel.getReport();
for (const step of report.steps) {
  if (step.dropoffFromPrevious > 0.5) {
    console.warn(`High dropoff at "${step.stepName}": ${(step.dropoffFromPrevious * 100).toFixed(0)}%`);
  }
}
```

## Analyzing dropoff points
```typescript
const funnel = new FunnelReporter({
  funnelId: "upgrade",
  steps: ["view_plans", "select_plan", "enter_payment", "confirm"],
});

// After collecting data from many users...
const report = funnel.getReport();

// Find the biggest dropoff
let worstStep = report.steps[0];
for (const step of report.steps) {
  if (step.dropoffFromPrevious > worstStep.dropoffFromPrevious) {
    worstStep = step;
  }
}

console.log(
  `Biggest dropoff: "${worstStep.stepName}" ` +
  `(${(worstStep.dropoffFromPrevious * 100).toFixed(1)}% lost)`
);
```

## Reset and reuse
```typescript
const funnel = new FunnelReporter({
  funnelId: "daily-funnel",
  steps: ["visit", "engage", "convert"],
  windowMs: 24 * 60 * 60 * 1000,
});

// Daily cron: generate report and reset
function dailyReport() {
  const report = funnel.getReport();
  saveToDatabase(report);
  funnel.reset(); // clear data, keep step definitions
}
```

---

## Python Examples

### Basic funnel
```python
from funnel_report import FunnelReporter

funnel = FunnelReporter(
    funnel_id="signup",
    steps=["visit", "signup", "verify", "active"],
)

funnel.record_step("user_1", "visit")
funnel.record_step("user_1", "signup")
funnel.record_step("user_1", "verify")

report = funnel.get_report()
print(f"Overall conversion: {report.overall_conversion:.1%}")
```

### Flask admin endpoint
```python
from flask import Flask, jsonify
from funnel_report import FunnelReporter

app = Flask(__name__)

funnel = FunnelReporter(
    funnel_id="onboarding",
    steps=["signup", "verify_email", "first_project", "invite_team"],
)

@app.route("/admin/funnel")
def funnel_report():
    report = funnel.get_report()
    return jsonify({
        "funnelId": report.funnel_id,
        "totalUsers": report.total_users,
        "overallConversion": report.overall_conversion,
        "steps": [
            {"name": s.step_name, "users": s.users, "dropoff": s.dropoff_from_previous}
            for s in report.steps
        ],
    })
```
