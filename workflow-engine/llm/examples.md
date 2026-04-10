# @radzor/workflow-engine — Usage Examples

## Simple sequential workflow
```typescript
import { WorkflowEngine } from "@radzor/workflow-engine";

const engine = new WorkflowEngine();

const id = engine.defineWorkflow({
  name: "data-pipeline",
  steps: [
    {
      id: "fetch",
      name: "Fetch Data",
      handler: async () => {
        const resp = await fetch("https://api.example.com/data");
        return resp.json();
      },
    },
    {
      id: "transform",
      name: "Transform",
      handler: async (prev) => {
        const data = prev.fetch as { items: { name: string }[] };
        return data.items.map((i) => i.name.toUpperCase());
      },
    },
    {
      id: "save",
      name: "Save Results",
      handler: async (prev) => {
        await fetch("https://api.example.com/results", {
          method: "POST",
          body: JSON.stringify({ names: prev.transform }),
        });
        return { saved: true };
      },
    },
  ],
});

const result = await engine.execute(id);
console.log(result.status, result.output);
```

## Conditional step execution
```typescript
const id = engine.defineWorkflow({
  name: "conditional-flow",
  steps: [
    {
      id: "checkFeature",
      name: "Check Feature Flag",
      handler: async () => ({ enabled: Math.random() > 0.5 }),
    },
    {
      id: "featureAction",
      name: "Run if Enabled",
      handler: async () => ({ action: "executed" }),
      condition: (ctx) => (ctx.stepOutputs.checkFeature as { enabled: boolean }).enabled,
    },
  ],
});

const result = await engine.execute(id);
const featureStep = result.steps.find((s) => s.stepId === "featureAction");
console.log(featureStep?.status); // "completed" or "skipped"
```

## Steps with retries and error handling
```typescript
const id = engine.defineWorkflow({
  name: "resilient-pipeline",
  steps: [
    {
      id: "flaky",
      name: "Flaky API Call",
      handler: async () => {
        const resp = await fetch("https://flaky-service.example.com/data");
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        return resp.json();
      },
      retries: 3,
      timeout: 10000,
      onError: "fail",
    },
    {
      id: "notify",
      name: "Send Notification",
      handler: async (prev) => {
        await fetch("https://hooks.slack.com/trigger", {
          method: "POST",
          body: JSON.stringify({ text: `Data fetched: ${JSON.stringify(prev.flaky)}` }),
        });
        return { notified: true };
      },
      onError: "continue", // don't fail the workflow if notification fails
    },
  ],
});

const result = await engine.execute(id);
```

## Monitoring workflow events
```typescript
const engine = new WorkflowEngine({ defaultTimeout: 15000 });

engine.on("onStepComplete", ({ stepName, duration }) => {
  console.log(`✓ ${stepName} (${duration}ms)`);
});

engine.on("onWorkflowComplete", ({ workflowId, status, duration }) => {
  console.log(`Workflow ${workflowId} ${status} in ${duration}ms`);
});

engine.on("onWorkflowFailed", ({ workflowId, stepId, error }) => {
  console.error(`Workflow ${workflowId} failed at ${stepId}: ${error}`);
});
```

## Pause and resume a workflow
```typescript
const id = engine.defineWorkflow({
  name: "long-running",
  steps: [
    { id: "step1", name: "Step 1", handler: async () => "done1" },
    {
      id: "step2",
      name: "Step 2",
      handler: async () => {
        await new Promise((r) => setTimeout(r, 5000));
        return "done2";
      },
    },
    { id: "step3", name: "Step 3", handler: async () => "done3" },
  ],
});

// Start execution in background
const promise = engine.execute(id);

// Check status and pause after a delay
setTimeout(async () => {
  const executions = [...(engine as any).executions.entries()];
  if (executions.length > 0) {
    const [execId] = executions[0];
    const status = engine.getStatus(execId);
    console.log("Status:", status.state, `${status.completedSteps}/${status.totalSteps}`);
  }
}, 1000);
```

---

## Python Examples

### Sequential workflow
```python
from workflow_engine import WorkflowEngine
import httpx

engine = WorkflowEngine()

async def fetch_data(prev, ctx):
    async with httpx.AsyncClient() as client:
        resp = await client.get("https://api.example.com/data")
        return resp.json()

async def transform(prev, ctx):
    return [item["name"].upper() for item in prev["fetch"]["items"]]

workflow_id = engine.define_workflow({
    "name": "data-pipeline",
    "steps": [
        {"id": "fetch", "name": "Fetch", "handler": fetch_data},
        {"id": "transform", "name": "Transform", "handler": transform},
    ],
})

result = await engine.execute(workflow_id)
print(result["status"], result["output"])
```

### Workflow with retries
```python
workflow_id = engine.define_workflow({
    "name": "resilient",
    "steps": [
        {
            "id": "call",
            "name": "API Call",
            "handler": flaky_api_call,
            "retries": 3,
            "timeout": 10000,
            "on_error": "fail",
        },
    ],
})
```
