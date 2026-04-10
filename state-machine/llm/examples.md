# @radzor/state-machine — Usage Examples

## Order lifecycle state machine
```typescript
import { StateMachine } from "@radzor/state-machine";

const order = new StateMachine({
  definition: {
    initial: "pending",
    states: {
      pending: {
        on: {
          PAY: { target: "paid" },
          CANCEL: { target: "cancelled" },
        },
      },
      paid: {
        on: {
          SHIP: { target: "shipped" },
          REFUND: { target: "refunded" },
        },
        onEnter: (ctx) => ({ paidAt: Date.now(), ...ctx }),
      },
      shipped: {
        on: {
          DELIVER: { target: "delivered" },
          RETURN: { target: "returned" },
        },
      },
      delivered: {},
      cancelled: {},
      refunded: {},
      returned: {},
    },
  },
  context: { orderId: "ORD-001" },
});

order.transition("PAY");
order.transition("SHIP");
console.log(order.getState().current); // "shipped"
```

## Guards for conditional transitions
```typescript
const machine = new StateMachine({
  definition: {
    initial: "cart",
    states: {
      cart: {
        on: {
          CHECKOUT: {
            target: "payment",
            guard: (ctx) => (ctx.itemCount as number) > 0,
            guardName: "hasItems",
          },
        },
      },
      payment: {
        on: {
          PAY: {
            target: "confirmed",
            guard: (ctx) => (ctx.balance as number) >= (ctx.total as number),
            guardName: "sufficientBalance",
            action: (ctx) => ({
              balance: (ctx.balance as number) - (ctx.total as number),
            }),
          },
          CANCEL: "cart",
        },
      },
      confirmed: {},
    },
  },
  context: { itemCount: 2, total: 50, balance: 100 },
});

machine.transition("CHECKOUT"); // passes guard
machine.transition("PAY");
console.log(machine.getState().context.balance); // 50
```

## Listening for transitions and guard rejections
```typescript
const machine = new StateMachine({
  definition: {
    initial: "locked",
    states: {
      locked: {
        on: {
          UNLOCK: {
            target: "unlocked",
            guard: (ctx, payload) => payload?.pin === ctx.pin,
            guardName: "pinCheck",
          },
        },
      },
      unlocked: {
        on: { LOCK: "locked" },
      },
    },
  },
  context: { pin: "1234" },
});

machine.on("onTransition", ({ from, to, event }) => {
  console.log(`${from} → ${to} (event: ${event})`);
});

machine.on("onGuardRejected", ({ from, event, guard }) => {
  console.warn(`Guard '${guard}' rejected event '${event}' in state '${from}'`);
});

machine.transition("UNLOCK", { pin: "0000" }); // guard rejects
machine.transition("UNLOCK", { pin: "1234" }); // succeeds
```

## Checking available transitions
```typescript
const machine = new StateMachine({
  definition: {
    initial: "draft",
    states: {
      draft: { on: { SUBMIT: "review", DELETE: "deleted" } },
      review: { on: { APPROVE: "published", REJECT: "draft" } },
      published: {},
      deleted: {},
    },
  },
});

console.log(machine.canTransition("SUBMIT")); // true
console.log(machine.canTransition("APPROVE")); // false — not in "review"

machine.transition("SUBMIT");
console.log(machine.canTransition("APPROVE")); // true
```

## Inspecting history and resetting
```typescript
const machine = new StateMachine({
  definition: {
    initial: "a",
    states: {
      a: { on: { GO: "b" } },
      b: { on: { GO: "c" } },
      c: { on: { GO: "a" } },
    },
  },
  historySize: 10,
});

machine.transition("GO");
machine.transition("GO");
machine.transition("GO");

const history = machine.getHistory();
console.log(history.length); // 3
console.log(history.map((h) => `${h.from}→${h.to}`)); // ["a→b", "b→c", "c→a"]

machine.reset();
console.log(machine.getState().current); // "a"
console.log(machine.getHistory().length); // 0
```

---

## Python Examples

### Basic state machine
```python
from state_machine import StateMachine

machine = StateMachine(
    definition={
        "initial": "idle",
        "states": {
            "idle": {"on": {"START": {"target": "running"}}},
            "running": {"on": {"STOP": {"target": "idle"}, "DONE": {"target": "finished"}}},
            "finished": {},
        },
    }
)

machine.transition("START")
print(machine.get_state()["current"])  # "running"

machine.transition("DONE")
print(machine.get_state()["current"])  # "finished"
```

### Guards in Python
```python
machine = StateMachine(
    definition={
        "initial": "locked",
        "states": {
            "locked": {
                "on": {
                    "UNLOCK": {
                        "target": "unlocked",
                        "guard": lambda ctx, payload: payload.get("code") == ctx["code"],
                    }
                }
            },
            "unlocked": {"on": {"LOCK": "locked"}},
        },
    },
    context={"code": "secret"},
)

machine.transition("UNLOCK", {"code": "wrong"})   # guard rejects
machine.transition("UNLOCK", {"code": "secret"})  # succeeds
```

### History tracking
```python
machine.transition("START")
machine.transition("STOP")

for record in machine.get_history():
    print(f"{record['from']} → {record['to']} via {record['event']}")
```
