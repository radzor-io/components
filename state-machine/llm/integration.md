# How to integrate @radzor/state-machine

## Overview
This component implements a finite state machine (FSM) with declarative state definitions, transition guards, entry/exit actions, and transition history. Define your states and allowed transitions, then drive the machine by sending events.

## Integration Steps

1. **Install**: Copy `src/index.ts` into your project or import from the package.

2. **Define and create the machine**:
```typescript
import { StateMachine } from "@radzor/state-machine";

const machine = new StateMachine({
  definition: {
    initial: "idle",
    states: {
      idle: {
        on: {
          START: { target: "running" },
        },
      },
      running: {
        on: {
          PAUSE: { target: "paused" },
          COMPLETE: { target: "done" },
          FAIL: { target: "failed" },
        },
        onEnter: (ctx) => ({ startedAt: Date.now(), ...ctx }),
      },
      paused: {
        on: {
          RESUME: { target: "running" },
          CANCEL: { target: "idle" },
        },
      },
      done: {
        onEnter: (ctx) => ({ completedAt: Date.now(), ...ctx }),
      },
      failed: {},
    },
  },
  context: { retries: 0 },
  historySize: 50,
});
```

3. **Send events to drive transitions**:
```typescript
machine.transition("START");
console.log(machine.getState().current); // "running"

machine.transition("PAUSE");
console.log(machine.getState().current); // "paused"
```

4. **Use guards for conditional transitions**:
```typescript
const machine = new StateMachine({
  definition: {
    initial: "draft",
    states: {
      draft: {
        on: {
          SUBMIT: {
            target: "review",
            guard: (ctx) => (ctx.wordCount as number) >= 100,
            guardName: "minWordCount",
          },
        },
      },
      review: { on: { APPROVE: "published", REJECT: "draft" } },
      published: {},
    },
  },
  context: { wordCount: 0 },
});
```

5. **Listen for transitions**:
```typescript
machine.on("onTransition", ({ from, to, event }) => {
  console.log(`${from} → ${to} via ${event}`);
});

machine.on("onGuardRejected", ({ from, event, guard }) => {
  console.warn(`Transition ${event} blocked by guard '${guard}' in state ${from}`);
});
```

6. **Python equivalent**:
```python
from state_machine import StateMachine

machine = StateMachine(
    definition={
        "initial": "idle",
        "states": {
            "idle": {"on": {"START": {"target": "running"}}},
            "running": {"on": {"COMPLETE": {"target": "done"}}},
            "done": {},
        },
    },
    context={"count": 0},
)

machine.transition("START")
print(machine.get_state()["current"])  # "running"
```

## Environment Variables Required
None. This component has no external dependencies.

## Constraints
- State is in-memory; lost on process restart. Serialise `getState()` for persistence.
- Guards must be synchronous functions.
- Context mutations in `onEnter`, `onExit`, and transition `action` callbacks should return new objects, not mutate in place.
- Sending an event with no matching transition from the current state throws an error. Use `canTransition()` to check first.

## Composability
- Use with `@radzor/workflow-engine` to model complex workflow states.
- Combine with `@radzor/event-bus` to broadcast state changes across services.
- Drive UI state in `@radzor/chatbot-flow` for conversation state tracking.
