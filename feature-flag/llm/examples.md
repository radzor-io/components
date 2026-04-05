# @radzor/feature-flag — Usage Examples

## Static on/off flags
```typescript
import { FeatureFlags } from "@radzor/feature-flag";

const flags = new FeatureFlags({
  flags: {
    newCheckout: true,
    legacyApi: false,
  },
});

if (flags.isEnabled("newCheckout")) {
  console.log("Using new checkout flow");
}
```

## Percentage rollout (10% of users)
```typescript
const flags = new FeatureFlags({
  flags: {
    aiSuggestions: 10, // 10% rollout
  },
});

// Deterministic: user "abc123" always gets the same result
const userId = req.user.id;
if (flags.isEnabled("aiSuggestions", userId)) {
  return getAiSuggestions(userId);
}
```

## Multi-variant string flag
```typescript
const flags = new FeatureFlags({
  flags: {
    uiTheme: "nord",
  },
});

const theme = flags.getValue("uiTheme", "default") as string;
document.body.setAttribute("data-theme", theme);
```

## Environment variable override
```bash
# In your shell or .env
FF_NEW_CHECKOUT=false
FF_AI_SUGGESTIONS=100
```
```typescript
const flags = new FeatureFlags({
  flags: { newCheckout: true, aiSuggestions: 10 },
  overrideEnv: true, // default
});

// FF_NEW_CHECKOUT=false overrides the true in config
flags.isEnabled("newCheckout"); // false

// FF_AI_SUGGESTIONS=100 forces 100% rollout
flags.isEnabled("aiSuggestions", "any-user"); // true
```

## Runtime overrides for tests and support
```typescript
const flags = new FeatureFlags({
  flags: { betaFeature: false },
});

// In a test
flags.setOverride("betaFeature", true);
expect(flags.isEnabled("betaFeature")).toBe(true);
flags.clearOverride("betaFeature");

// In an admin panel endpoint
app.post("/admin/flags/:name", (req, res) => {
  flags.setOverride(req.params.name, req.body.value);
  res.json({ all: flags.getAll() });
});
```
