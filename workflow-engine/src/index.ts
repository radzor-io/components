// @radzor/workflow-engine — Define and execute multi-step workflows with branching and error handling

export interface StepDefinition {
  id: string;
  name: string;
  handler: (input: Record<string, unknown>, context: WorkflowContext) => Promise<unknown>;
  timeout?: number;
  retries?: number;
  condition?: (context: WorkflowContext) => boolean;
  onError?: "fail" | "skip" | "continue";
}

export interface ParallelGroup {
  id: string;
  steps: StepDefinition[];
}

export interface WorkflowDefinition {
  id?: string;
  name: string;
  steps: (StepDefinition | ParallelGroup)[];
}

export interface WorkflowContext {
  workflowId: string;
  executionId: string;
  input: Record<string, unknown>;
  stepOutputs: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

export interface StepResult {
  stepId: string;
  stepName: string;
  status: "completed" | "failed" | "skipped";
  output: unknown;
  error: string | null;
  duration: number;
  attempts: number;
}

export interface WorkflowResult {
  executionId: string;
  workflowId: string;
  status: "completed" | "failed" | "cancelled";
  steps: StepResult[];
  output: Record<string, unknown>;
  duration: number;
}

export interface ExecutionStatus {
  executionId: string;
  workflowId: string;
  state: "running" | "paused" | "completed" | "failed" | "cancelled";
  currentStep: string | null;
  completedSteps: number;
  totalSteps: number;
  startedAt: number;
}

export interface WorkflowEngineConfig {
  maxConcurrency?: number;
  defaultTimeout?: number;
  retryAttempts?: number;
}

export type EventMap = {
  onStepComplete: { workflowId: string; stepId: string; stepName: string; output: unknown; duration: number };
  onWorkflowComplete: { workflowId: string; executionId: string; status: string; duration: number };
  onWorkflowFailed: { workflowId: string; executionId: string; stepId: string; error: string };
};

type Listener<T> = (event: T) => void;

function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function isParallelGroup(step: StepDefinition | ParallelGroup): step is ParallelGroup {
  return "steps" in step && Array.isArray((step as ParallelGroup).steps);
}

interface ExecutionState {
  executionId: string;
  workflowId: string;
  state: "running" | "paused" | "completed" | "failed" | "cancelled";
  context: WorkflowContext;
  definition: WorkflowDefinition;
  stepResults: StepResult[];
  currentStepIndex: number;
  startedAt: number;
  resolve?: (result: WorkflowResult) => void;
  reject?: (error: Error) => void;
  pausePromise?: { resolve: () => void; reject: (err: Error) => void };
}

export class WorkflowEngine {
  private config: Required<WorkflowEngineConfig>;
  private workflows = new Map<string, WorkflowDefinition>();
  private executions = new Map<string, ExecutionState>();
  private listeners: { [K in keyof EventMap]?: Listener<EventMap[K]>[] } = {};

  constructor(config: WorkflowEngineConfig = {}) {
    this.config = {
      maxConcurrency: config.maxConcurrency ?? 5,
      defaultTimeout: config.defaultTimeout ?? 30000,
      retryAttempts: config.retryAttempts ?? 0,
    };
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

  defineWorkflow(definition: WorkflowDefinition): string {
    const id = definition.id ?? generateId();
    this.workflows.set(id, { ...definition, id });
    return id;
  }

  async execute(workflowId: string, input: Record<string, unknown> = {}): Promise<WorkflowResult> {
    const definition = this.workflows.get(workflowId);
    if (!definition) throw new Error(`Workflow '${workflowId}' not found`);

    const executionId = generateId();
    const context: WorkflowContext = {
      workflowId,
      executionId,
      input,
      stepOutputs: {},
      metadata: {},
    };

    const execution: ExecutionState = {
      executionId,
      workflowId,
      state: "running",
      context,
      definition,
      stepResults: [],
      currentStepIndex: 0,
      startedAt: Date.now(),
    };

    this.executions.set(executionId, execution);

    try {
      await this.runSteps(execution);
      execution.state = "completed";

      const result = this.buildResult(execution);
      this.emit("onWorkflowComplete", {
        workflowId,
        executionId,
        status: result.status,
        duration: result.duration,
      });
      return result;
    } catch (err) {
      if (execution.state === "cancelled") {
        return this.buildResult(execution);
      }
      execution.state = "failed";
      const errorMsg = err instanceof Error ? err.message : String(err);
      const failedStep = execution.stepResults[execution.stepResults.length - 1]?.stepId ?? "unknown";
      this.emit("onWorkflowFailed", { workflowId, executionId, stepId: failedStep, error: errorMsg });
      return this.buildResult(execution);
    }
  }

  private async runSteps(execution: ExecutionState): Promise<void> {
    const steps = execution.definition.steps;

    for (let i = execution.currentStepIndex; i < steps.length; i++) {
      if (execution.state === "cancelled") return;

      if (execution.state === "paused") {
        execution.currentStepIndex = i;
        await new Promise<void>((resolve, reject) => {
          execution.pausePromise = { resolve, reject };
        });
        if (execution.state === "cancelled") return;
      }

      const step = steps[i];

      if (isParallelGroup(step)) {
        await this.runParallelGroup(execution, step);
      } else {
        await this.runSingleStep(execution, step);
      }

      execution.currentStepIndex = i + 1;
    }
  }

  private async runParallelGroup(execution: ExecutionState, group: ParallelGroup): Promise<void> {
    const concurrency = this.config.maxConcurrency;
    const steps = group.steps;
    let index = 0;

    const runNext = async (): Promise<void> => {
      while (index < steps.length) {
        const step = steps[index++];
        await this.runSingleStep(execution, step);
      }
    };

    const workers = Array.from({ length: Math.min(concurrency, steps.length) }, () => runNext());
    await Promise.all(workers);
  }

  private async runSingleStep(execution: ExecutionState, step: StepDefinition): Promise<void> {
    const context = execution.context;

    if (step.condition && !step.condition(context)) {
      execution.stepResults.push({
        stepId: step.id,
        stepName: step.name,
        status: "skipped",
        output: null,
        error: null,
        duration: 0,
        attempts: 0,
      });
      return;
    }

    const maxAttempts = (step.retries ?? this.config.retryAttempts) + 1;
    const timeout = step.timeout ?? this.config.defaultTimeout;
    let lastError: Error | null = null;
    let attempts = 0;
    const stepStart = Date.now();

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      attempts++;
      try {
        const result = await this.runWithTimeout(step.handler(context.stepOutputs, context), timeout);
        const duration = Date.now() - stepStart;

        context.stepOutputs[step.id] = result;
        execution.stepResults.push({
          stepId: step.id,
          stepName: step.name,
          status: "completed",
          output: result,
          error: null,
          duration,
          attempts,
        });

        this.emit("onStepComplete", {
          workflowId: execution.workflowId,
          stepId: step.id,
          stepName: step.name,
          output: result,
          duration,
        });
        return;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
      }
    }

    const duration = Date.now() - stepStart;
    const errorBehavior = step.onError ?? "fail";

    if (errorBehavior === "skip" || errorBehavior === "continue") {
      execution.stepResults.push({
        stepId: step.id,
        stepName: step.name,
        status: errorBehavior === "skip" ? "skipped" : "failed",
        output: null,
        error: lastError?.message ?? "Unknown error",
        duration,
        attempts,
      });
      return;
    }

    execution.stepResults.push({
      stepId: step.id,
      stepName: step.name,
      status: "failed",
      output: null,
      error: lastError?.message ?? "Unknown error",
      duration,
      attempts,
    });
    throw lastError;
  }

  private runWithTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Step timed out after ${ms}ms`)), ms);
      promise.then(
        (val) => { clearTimeout(timer); resolve(val); },
        (err) => { clearTimeout(timer); reject(err); },
      );
    });
  }

  pause(executionId: string): void {
    const execution = this.executions.get(executionId);
    if (!execution) throw new Error(`Execution '${executionId}' not found`);
    if (execution.state !== "running") throw new Error(`Execution is not running (state: ${execution.state})`);
    execution.state = "paused";
  }

  resume(executionId: string): Promise<WorkflowResult> {
    const execution = this.executions.get(executionId);
    if (!execution) throw new Error(`Execution '${executionId}' not found`);
    if (execution.state !== "paused") throw new Error(`Execution is not paused (state: ${execution.state})`);
    execution.state = "running";
    if (execution.pausePromise) {
      execution.pausePromise.resolve();
    }
    return new Promise<WorkflowResult>((resolve) => {
      const check = setInterval(() => {
        if (execution.state === "completed" || execution.state === "failed" || execution.state === "cancelled") {
          clearInterval(check);
          resolve(this.buildResult(execution));
        }
      }, 50);
    });
  }

  cancel(executionId: string): void {
    const execution = this.executions.get(executionId);
    if (!execution) throw new Error(`Execution '${executionId}' not found`);
    execution.state = "cancelled";
    if (execution.pausePromise) {
      execution.pausePromise.resolve();
    }
  }

  getStatus(executionId: string): ExecutionStatus {
    const execution = this.executions.get(executionId);
    if (!execution) throw new Error(`Execution '${executionId}' not found`);

    const totalSteps = this.countSteps(execution.definition.steps);
    return {
      executionId: execution.executionId,
      workflowId: execution.workflowId,
      state: execution.state,
      currentStep: execution.currentStepIndex < execution.definition.steps.length
        ? (execution.definition.steps[execution.currentStepIndex] as StepDefinition).id ?? null
        : null,
      completedSteps: execution.stepResults.length,
      totalSteps,
      startedAt: execution.startedAt,
    };
  }

  private countSteps(steps: (StepDefinition | ParallelGroup)[]): number {
    return steps.reduce((count, step) => {
      if (isParallelGroup(step)) return count + step.steps.length;
      return count + 1;
    }, 0);
  }

  private buildResult(execution: ExecutionState): WorkflowResult {
    return {
      executionId: execution.executionId,
      workflowId: execution.workflowId,
      status: execution.state === "completed" ? "completed" : execution.state === "cancelled" ? "cancelled" : "failed",
      steps: [...execution.stepResults],
      output: { ...execution.context.stepOutputs },
      duration: Date.now() - execution.startedAt,
    };
  }
}

export default WorkflowEngine;
