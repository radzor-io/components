// @radzor/state-machine — Finite state machine with guards, actions, and history

export interface TransitionDefinition {
  target: string;
  guard?: (context: Record<string, unknown>, payload?: Record<string, unknown>) => boolean;
  guardName?: string;
  action?: (context: Record<string, unknown>, payload?: Record<string, unknown>) => Record<string, unknown>;
}

export interface StateDefinition {
  on?: Record<string, TransitionDefinition | string>;
  onEnter?: (context: Record<string, unknown>) => Record<string, unknown> | void;
  onExit?: (context: Record<string, unknown>) => Record<string, unknown> | void;
}

export interface MachineDefinition {
  initial: string;
  states: Record<string, StateDefinition>;
}

export interface TransitionRecord {
  from: string;
  to: string;
  event: string;
  payload: Record<string, unknown> | undefined;
  timestamp: number;
}

export interface MachineState {
  current: string;
  context: Record<string, unknown>;
  history: TransitionRecord[];
}

export interface StateMachineConfig {
  definition: MachineDefinition;
  context?: Record<string, unknown>;
  historySize?: number;
}

export type EventMap = {
  onTransition: { from: string; to: string; event: string; context: Record<string, unknown> };
  onGuardRejected: { from: string; event: string; guard: string; context: Record<string, unknown> };
};

type Listener<T> = (event: T) => void;

export class StateMachine {
  private current: string;
  private context: Record<string, unknown>;
  private definition: MachineDefinition;
  private historySize: number;
  private historyList: TransitionRecord[] = [];
  private initialState: string;
  private initialContext: Record<string, unknown>;
  private listeners: { [K in keyof EventMap]?: Listener<EventMap[K]>[] } = {};

  constructor(config: StateMachineConfig) {
    this.definition = config.definition;
    this.current = config.definition.initial;
    this.initialState = config.definition.initial;
    this.context = { ...(config.context ?? {}) };
    this.initialContext = { ...(config.context ?? {}) };
    this.historySize = config.historySize ?? 100;

    if (!this.definition.states[this.current]) {
      throw new Error(`Initial state '${this.current}' is not defined`);
    }

    const enterFn = this.definition.states[this.current]?.onEnter;
    if (enterFn) {
      const newCtx = enterFn(this.context);
      if (newCtx) this.context = { ...this.context, ...newCtx };
    }
  }

  on<K extends keyof EventMap>(event: K, listener: Listener<EventMap[K]>): void {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event]!.push(listener);
  }

  off<K extends keyof EventMap>(event: K, listener: Listener<EventMap[K]>): void {
    const list = this.listeners[event];
    if (list) this.listeners[event] = list.filter((l) => l !== listener) as typeof list;
  }

  private emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
    const list = this.listeners[event];
    if (list) list.forEach((l) => l(payload));
  }

  private resolveTransition(event: string): TransitionDefinition | null {
    const stateDef = this.definition.states[this.current];
    if (!stateDef?.on) return null;

    const transitionDef = stateDef.on[event];
    if (!transitionDef) return null;

    if (typeof transitionDef === "string") {
      return { target: transitionDef };
    }
    return transitionDef;
  }

  transition(event: string, payload?: Record<string, unknown>): MachineState {
    const transitionDef = this.resolveTransition(event);
    if (!transitionDef) {
      throw new Error(`No transition for event '${event}' from state '${this.current}'`);
    }

    const targetState = transitionDef.target;
    if (!this.definition.states[targetState]) {
      throw new Error(`Target state '${targetState}' is not defined`);
    }

    if (transitionDef.guard) {
      const allowed = transitionDef.guard(this.context, payload);
      if (!allowed) {
        const guardName = transitionDef.guardName ?? transitionDef.guard.name || "anonymous";
        this.emit("onGuardRejected", {
          from: this.current,
          event,
          guard: guardName,
          context: { ...this.context },
        });
        return this.getState();
      }
    }

    const fromState = this.current;

    // onExit of current state
    const exitFn = this.definition.states[fromState]?.onExit;
    if (exitFn) {
      const newCtx = exitFn(this.context);
      if (newCtx) this.context = { ...this.context, ...newCtx };
    }

    // transition action
    if (transitionDef.action) {
      const newCtx = transitionDef.action(this.context, payload);
      if (newCtx) this.context = { ...this.context, ...newCtx };
    }

    this.current = targetState;

    // onEnter of new state
    const enterFn = this.definition.states[targetState]?.onEnter;
    if (enterFn) {
      const newCtx = enterFn(this.context);
      if (newCtx) this.context = { ...this.context, ...newCtx };
    }

    const record: TransitionRecord = {
      from: fromState,
      to: targetState,
      event,
      payload,
      timestamp: Date.now(),
    };

    this.historyList.push(record);
    if (this.historyList.length > this.historySize) {
      this.historyList = this.historyList.slice(-this.historySize);
    }

    this.emit("onTransition", {
      from: fromState,
      to: targetState,
      event,
      context: { ...this.context },
    });

    return this.getState();
  }

  getState(): MachineState {
    return {
      current: this.current,
      context: { ...this.context },
      history: [...this.historyList],
    };
  }

  getHistory(): TransitionRecord[] {
    return [...this.historyList];
  }

  reset(): void {
    this.current = this.initialState;
    this.context = { ...this.initialContext };
    this.historyList = [];

    const enterFn = this.definition.states[this.current]?.onEnter;
    if (enterFn) {
      const newCtx = enterFn(this.context);
      if (newCtx) this.context = { ...this.context, ...newCtx };
    }
  }

  canTransition(event: string): boolean {
    const transitionDef = this.resolveTransition(event);
    if (!transitionDef) return false;

    if (transitionDef.guard) {
      return transitionDef.guard(this.context);
    }

    return true;
  }
}

export default StateMachine;
