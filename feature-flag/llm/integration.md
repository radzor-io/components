# How to integrate @radzor/feature-flag

## Overview
This component evaluates feature flags with zero dependencies. It supports static on/off flags, percentage rollouts (deterministic per user), environment variable overrides (`FF_FLAG_NAME`), and runtime overrides for testing.

## Integration Steps

1. **Install**: Copy `src/index.ts` into your project or import from the package.

2. **Create an instance** with your flag definitions:
```typescript
import { FeatureFlags } from "@radzor/feature-flag";

const flags = new FeatureFlags({
  flags: {
    newDashboard: false,       // boolean: static on/off
    betaExport: true,
    darkMode: 50,              // number 0-100: percentage rollout (50% of users)
    theme: "default",          // string: multi-variant flag
  },
  overrideEnv: true,           // read FF_* env vars, default: true
});
```

3. **Check flags**:
```typescript
// Boolean/static flag
if (flags.isEnabled("newDashboard")) {
  renderNewDashboard();
}

// Percentage rollout — deterministic for the same userId
if (flags.isEnabled("darkMode", userId)) {
  applyDarkTheme();
}

// String or number flag value
const theme = flags.getValue("theme", "default");
```

4. **Get all flags at once** (useful for server-side rendering):
```typescript
const allFlags = flags.getAll(userId);
// Returns { newDashboard: false, betaExport: true, darkMode: true/false, theme: "default" }
```

5. **Override flags at runtime** (for testing or support):
```typescript
flags.setOverride("newDashboard", true);
flags.clearOverride("newDashboard");
flags.clearAllOverrides();
```

6. **Listen for events**:
```typescript
flags.on("onOverride", ({ flag, value, previous }) => {
  console.log(`Flag "${flag}" overridden: ${previous} → ${value}`);
});
```

## Constraints
- Percentage rollout uses a deterministic djb2 hash of `flagName + userId`. The same user always gets the same result.
- A number flag `0-100` means percentage: `isEnabled("flag", userId)` returns `true` if `hash(flag+userId) % 100 < value`.
- Env overrides: set `FF_NEW_DASHBOARD=true` to force `newDashboard` on for all users regardless of config.
- Overrides are in-memory only and reset on process restart.

## Composability
- Pass `getAll(userId)` to your frontend via a `/api/flags` endpoint for client-side hydration.
- Combine with `@radzor/session-manager` to extract `userId` from the session before calling `isEnabled()`.
