// @radzor/cron-scheduler — In-process cron scheduler

export interface CronSchedulerConfig {
  timezone?: string;
}

export interface JobEntry {
  id: string;
  expression: string;
  handler: () => void | Promise<void>;
  intervalMs?: number;
  cronFields?: CronFields;
  timer?: ReturnType<typeof setInterval>;
}

export interface CronFields {
  minute: number[];
  hour: number[];
  dayOfMonth: number[];
  month: number[];
  dayOfWeek: number[];
}

export type EventMap = {
  onJobStart: { jobId: string; scheduledAt: number };
  onJobComplete: { jobId: string; duration: number };
  onJobError: { jobId: string; error: string };
  onError: { code: string; message: string };
};

export class CronScheduler {
  private timezone: string;
  private jobs: Map<string, JobEntry> = new Map();
  private running = false;
  private mainTimer?: ReturnType<typeof setInterval>;
  private listeners: Map<string, Function[]> = new Map();

  constructor(config?: CronSchedulerConfig) {
    this.timezone = config?.timezone ?? "UTC";
  }

  on<K extends keyof EventMap>(event: K, handler: (payload: EventMap[K]) => void): void {
    const handlers = this.listeners.get(event) ?? [];
    handlers.push(handler as Function);
    this.listeners.set(event, handlers);
  }

  off<K extends keyof EventMap>(event: K, handler: (payload: EventMap[K]) => void): void {
    const handlers = this.listeners.get(event) ?? [];
    this.listeners.set(event, handlers.filter((h) => h !== handler));
  }

  private emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
    for (const handler of this.listeners.get(event) ?? []) handler(payload);
  }

  schedule(jobId: string, expression: string, handler: () => void | Promise<void>): void {
    if (this.jobs.has(jobId)) {
      this.unschedule(jobId);
    }

    const entry: JobEntry = { id: jobId, expression, handler };

    // Parse interval expressions like "every 30s", "every 5m", "every 1h"
    const intervalMatch = expression.match(/^every\s+(\d+)(s|m|h)$/i);
    if (intervalMatch) {
      const value = parseInt(intervalMatch[1], 10);
      const unit = intervalMatch[2].toLowerCase();
      const multipliers: Record<string, number> = { s: 1000, m: 60000, h: 3600000 };
      entry.intervalMs = value * multipliers[unit];
    } else {
      entry.cronFields = this.parseCron(expression);
    }

    this.jobs.set(jobId, entry);

    if (this.running && entry.intervalMs) {
      entry.timer = setInterval(() => this.executeJob(entry), entry.intervalMs);
    }
  }

  unschedule(jobId: string): void {
    const job = this.jobs.get(jobId);
    if (job?.timer) clearInterval(job.timer);
    this.jobs.delete(jobId);
  }

  start(): void {
    if (this.running) return;
    this.running = true;

    // Start interval-based jobs
    for (const job of this.jobs.values()) {
      if (job.intervalMs) {
        job.timer = setInterval(() => this.executeJob(job), job.intervalMs);
      }
    }

    // Check cron jobs every second
    this.mainTimer = setInterval(() => this.checkCronJobs(), 1000);
  }

  stop(): void {
    this.running = false;
    if (this.mainTimer) clearInterval(this.mainTimer);
    for (const job of this.jobs.values()) {
      if (job.timer) clearInterval(job.timer);
    }
  }

  getJobs(): string[] {
    return Array.from(this.jobs.keys());
  }

  private async executeJob(job: JobEntry): Promise<void> {
    const start = Date.now();
    this.emit("onJobStart", { jobId: job.id, scheduledAt: start });

    try {
      await job.handler();
      this.emit("onJobComplete", { jobId: job.id, duration: Date.now() - start });
    } catch (err: any) {
      this.emit("onJobError", { jobId: job.id, error: err.message });
    }
  }

  private checkCronJobs(): void {
    const now = new Date();
    // Convert to timezone-aware date
    const tzDate = new Date(now.toLocaleString("en-US", { timeZone: this.timezone }));

    for (const job of this.jobs.values()) {
      if (!job.cronFields) continue;
      if (this.matchesCron(job.cronFields, tzDate) && tzDate.getSeconds() === 0) {
        this.executeJob(job);
      }
    }
  }

  private matchesCron(fields: CronFields, date: Date): boolean {
    return (
      fields.minute.includes(date.getMinutes()) &&
      fields.hour.includes(date.getHours()) &&
      fields.dayOfMonth.includes(date.getDate()) &&
      fields.month.includes(date.getMonth() + 1) &&
      fields.dayOfWeek.includes(date.getDay())
    );
  }

  private parseCron(expr: string): CronFields {
    const parts = expr.trim().split(/\s+/);
    if (parts.length !== 5) {
      throw new Error(`Invalid cron expression: "${expr}". Expected 5 fields.`);
    }

    return {
      minute: this.parseField(parts[0], 0, 59),
      hour: this.parseField(parts[1], 0, 23),
      dayOfMonth: this.parseField(parts[2], 1, 31),
      month: this.parseField(parts[3], 1, 12),
      dayOfWeek: this.parseField(parts[4], 0, 6),
    };
  }

  private parseField(field: string, min: number, max: number): number[] {
    const values: number[] = [];

    for (const part of field.split(",")) {
      if (part === "*") {
        for (let i = min; i <= max; i++) values.push(i);
      } else if (part.includes("/")) {
        const [range, stepStr] = part.split("/");
        const step = parseInt(stepStr, 10);
        const start = range === "*" ? min : parseInt(range, 10);
        for (let i = start; i <= max; i += step) values.push(i);
      } else if (part.includes("-")) {
        const [a, b] = part.split("-").map(Number);
        for (let i = a; i <= b; i++) values.push(i);
      } else {
        values.push(parseInt(part, 10));
      }
    }

    return values;
  }
}
