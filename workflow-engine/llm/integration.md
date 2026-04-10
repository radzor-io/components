# How to integrate @radzor/workflow-engine

## Overview
This component lets you define multi-step workflows as sequences of handler functions, then execute them with automatic error handling, retries, timeouts, and parallel step groups. Steps receive the aggregated output of all prior steps and can be conditionally skipped.

## Integration Steps

1. **Install**: Copy `src/index.ts` into your project or import from the package.

2. **Create an engine instance**:
```typescript
import { WorkflowEngine } from "@radzor/workflow-engine";

const engine = new WorkflowEngine({
  maxConcurrency: 5,   // parallel step limit
  defaultTimeout: 30000, // per-step timeout in ms
  retryAttempts: 0,      // default retries per step
});
```

3. **Define a workflow with steps**:
```typescript
const workflowId = engine.defineWorkflow({
  name: "user-onboarding",
  steps: [
    {
      id: "validate",
      name: "Validate Input",
      handler: async (prev, ctx) => {
        if (!ctx.input.email) throw new Error("Email required");
        return { email: ctx.input.email };
      },
    },
    {
      id: "createAccount",
      name: "Create Account",
      handler: async (prev) => {
        const resp = await fetch("https://api.example.com/users", {
          method: "POST",
          body: JSON.stringify({ email: prev.validate.email }),
        });
        return resp.json();
      },
      retries: 2,
      onError: "fail",
    },
    {
      id: "sendWelcome",
      name: "Send Welcome Email",
      handler: async (prev) => {
        await fetch("https://api.example.com/email", {
          method: "POST",
          body: JSON.stringify({ to: prev.validate.email, template: "welcome" }),
        });
        return { sent: true };
      },
      onError: "continue", // non-critical
    },
  ],
});
```

4. **Execute the workflow**:
```typescript
const result = await engine.execute(workflowId, { email: "user@example.com" });
console.log(result.status); // "completed" | "failed" | "cancelled"
console.log(result.output); // aggregated step outputs
```

5. **Listen for events**:
```typescript
engine.on("onStepComplete", ({ stepName, duration }) => {
  console.log(`${stepName} completed in ${duration}ms`);
});

engine.on("onWorkflowFailed", ({ stepId, error }) => {
  console.error(`Workflow failed at step ${stepId}: ${error}`);
});
```

6. **Python equivalent**:
```python
from workflow_engine import WorkflowEngine

engine = WorkflowEngine(max_concurrency=5, default_timeout=30000)

async def validate_handler(prev, ctx):
    if not ctx["input"].get("email"):
        raise ValueError("Email required")
    return {"email": ctx["input"]["email"]}

workflow_id = engine.define_workflow({
    "name": "user-onboarding",
    "steps": [
        {"id": "validate", "name": "Validate", "handler": validate_handler},
    ],
})

result = await engine.execute(workflow_id, {"email": "user@example.com"})
```

## Environment Variables Required
None. This component has no external dependencies.

## Constraints
- Workflows and executions are stored in-memory; state is lost on process restart.
- Steps run sequentially by default. Use `ParallelGroup` to run steps concurrently.
- Each step handler receives the aggregated output of all prior steps as its first argument.
- Step timeouts default to 30 seconds. Set `timeout` per step or globally via constructor.
- The `onError` field controls failure behaviour: `"fail"` (default) stops the workflow, `"skip"` marks the step as skipped, `"continue"` records the error and continues.

## Composability
- Chain with `@radzor/retry-handler` for custom retry strategies beyond the built-in retries.
- Use `@radzor/event-bus` to broadcast workflow events to other services.
- Feed workflow results into `@radzor/email-send` for notifications on completion or failure.
