// @radzor/funnel-report — Build and analyze conversion funnels with dropoff tracking

export interface FunnelConfig {
  funnelId: string;
  steps?: string[];
  windowMs?: number;
}

export interface StepEntry {
  stepName: string;
  timestamp: number;
}

export interface StepReport {
  stepName: string;
  users: number;
  conversionFromPrevious: number;
  dropoffFromPrevious: number;
}

export interface FunnelReport {
  funnelId: string;
  steps: StepReport[];
  conversionRates: number[];
  dropoff: number[];
  overallConversion: number;
  totalUsers: number;
}

export type EventMap = {};

export type Listener<T> = (event: T) => void;

export class FunnelReporter {
  private funnelId: string;
  private stepOrder: string[] = [];
  private stepIndices = new Map<string, number>();
  private windowMs: number;

  // userId -> array of step entries
  private userData = new Map<string, StepEntry[]>();

  private listeners: { [K in keyof EventMap]?: Listener<EventMap[K]>[] } = {};

  constructor(config: FunnelConfig) {
    this.funnelId = config.funnelId;
    this.windowMs = config.windowMs ?? 86400000; // default 24h

    if (config.steps) {
      for (const step of config.steps) {
        this.defineStep(step);
      }
    }
  }

  on<K extends keyof EventMap>(event: K, listener: Listener<EventMap[K]>): void {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event]!.push(listener);
  }

  off<K extends keyof EventMap>(event: K, listener: Listener<EventMap[K]>): void {
    const list = this.listeners[event];
    if (list) {
      this.listeners[event] = list.filter((l) => l !== listener) as typeof list;
    }
  }

  private emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
    const list = this.listeners[event];
    if (list) list.forEach((l) => l(payload));
  }

  // ─── Actions ─────────────────────────────────────────────

  defineStep(stepName: string): void {
    if (this.stepIndices.has(stepName)) {
      return; // already defined
    }
    const index = this.stepOrder.length;
    this.stepOrder.push(stepName);
    this.stepIndices.set(stepName, index);
  }

  recordStep(userId: string, stepName: string): void {
    if (!this.stepIndices.has(stepName)) {
      throw new Error(`Step "${stepName}" is not defined in funnel "${this.funnelId}". Call defineStep() first.`);
    }

    if (!this.userData.has(userId)) {
      this.userData.set(userId, []);
    }

    const entries = this.userData.get(userId)!;

    // Don't record duplicates for the same step
    if (entries.some((e) => e.stepName === stepName)) {
      return;
    }

    entries.push({
      stepName,
      timestamp: Date.now(),
    });
  }

  getReport(): FunnelReport {
    const now = Date.now();
    const stepCount = this.stepOrder.length;

    if (stepCount === 0) {
      return {
        funnelId: this.funnelId,
        steps: [],
        conversionRates: [],
        dropoff: [],
        overallConversion: 0,
        totalUsers: 0,
      };
    }

    // Build per-user progression: which steps did each user reach (in order)?
    const usersPerStep: Set<string>[] = this.stepOrder.map(() => new Set());

    for (const [userId, entries] of this.userData) {
      // Filter out entries outside the time window
      const validEntries = entries.filter((e) => now - e.timestamp <= this.windowMs);
      if (validEntries.length === 0) continue;

      // Build a set of completed steps for this user
      const completedSteps = new Set(validEntries.map((e) => e.stepName));

      // A user counts for step N only if they completed all steps 0..N (strict funnel)
      let reachedStep = -1;
      for (let i = 0; i < stepCount; i++) {
        if (completedSteps.has(this.stepOrder[i])) {
          reachedStep = i;
        } else {
          break;
        }
      }

      for (let i = 0; i <= reachedStep; i++) {
        usersPerStep[i].add(userId);
      }
    }

    const stepReports: StepReport[] = [];
    const conversionRates: number[] = [];
    const dropoffRates: number[] = [];

    for (let i = 0; i < stepCount; i++) {
      const currentUsers = usersPerStep[i].size;
      const previousUsers = i === 0 ? currentUsers : usersPerStep[i - 1].size;

      const conversionFromPrevious = previousUsers > 0 ? currentUsers / previousUsers : 0;
      const dropoffFromPrevious = previousUsers > 0 ? 1 - conversionFromPrevious : 0;

      stepReports.push({
        stepName: this.stepOrder[i],
        users: currentUsers,
        conversionFromPrevious: i === 0 ? 1 : conversionFromPrevious,
        dropoffFromPrevious: i === 0 ? 0 : dropoffFromPrevious,
      });

      conversionRates.push(i === 0 ? 1 : conversionFromPrevious);
      dropoffRates.push(i === 0 ? 0 : dropoffFromPrevious);
    }

    const firstStepUsers = usersPerStep[0].size;
    const lastStepUsers = usersPerStep[stepCount - 1].size;
    const overallConversion = firstStepUsers > 0 ? lastStepUsers / firstStepUsers : 0;

    return {
      funnelId: this.funnelId,
      steps: stepReports,
      conversionRates,
      dropoff: dropoffRates,
      overallConversion,
      totalUsers: firstStepUsers,
    };
  }

  reset(): void {
    this.userData.clear();
  }

  getSteps(): string[] {
    return [...this.stepOrder];
  }

  getUserCount(): number {
    return this.userData.size;
  }
}

export default FunnelReporter;
