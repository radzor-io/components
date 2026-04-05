import PgBoss from "pg-boss";

export interface BackgroundJobConfig {
  driver?: "pg-boss" | "bullmq";
  connection: string;
  concurrency?: number;
  maxAttempts?: number;
  backoffMs?: number;
}

export interface EnqueueOptions {
  delay?: number;
  priority?: number;
  repeat?: string;
  jobId?: string;
}

export interface JobResult {
  id: string;
  queue: string;
  status: "active" | "completed" | "failed" | "cancelled" | "retry" | "created";
  data: unknown;
  output?: unknown;
  attempt: number;
  createdOn: Date;
  completedOn?: Date;
}

export interface QueueStats {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}

type EventMap = {
  onJobCompleted: { jobId: string; queue: string; durationMs: number };
  onJobFailed: { jobId: string; queue: string; error: string; attempt: number };
  onJobRetry: { jobId: string; attempt: number; nextDelayMs: number };
};

type Listener<T> = (payload: T) => void;

export class BackgroundJob {
  private config: Required<BackgroundJobConfig>;
  private boss: PgBoss | null = null;
  private started = false;
  private listeners: Map<string, Listener<unknown>[]> = new Map();

  constructor(config: BackgroundJobConfig) {
    if (config.driver === "bullmq") {
      throw new Error(
        "BullMQ driver: install bullmq and use BullMQBackgroundJob. " +
          "This component ships pg-boss only. Switch driver to 'pg-boss' or implement a BullMQ adapter."
      );
    }

    this.config = {
      driver: config.driver ?? "pg-boss",
      connection: config.connection,
      concurrency: config.concurrency ?? 5,
      maxAttempts: config.maxAttempts ?? 3,
      backoffMs: config.backoffMs ?? 1000,
    };
  }

  on<K extends keyof EventMap>(event: K, listener: Listener<EventMap[K]>): void {
    const listeners = this.listeners.get(event) ?? [];
    listeners.push(listener as Listener<unknown>);
    this.listeners.set(event, listeners);
  }

  off<K extends keyof EventMap>(event: K, listener: Listener<EventMap[K]>): void {
    const listeners = this.listeners.get(event) ?? [];
    this.listeners.set(
      event,
      listeners.filter((l) => l !== (listener as Listener<unknown>))
    );
  }

  private emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
    const listeners = this.listeners.get(event) ?? [];
    for (const listener of listeners) {
      listener(payload as unknown);
    }
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.boss = new PgBoss(this.config.connection);
    await this.boss.start();
    this.started = true;
  }

  private async ensureStarted(): Promise<PgBoss> {
    if (!this.started) await this.start();
    return this.boss!;
  }

  async enqueue(
    queue: string,
    payload: unknown,
    options?: EnqueueOptions
  ): Promise<string> {
    const boss = await this.ensureStarted();

    const sendOptions: PgBoss.SendOptions = {
      retryLimit: this.config.maxAttempts - 1,
      retryDelay: Math.round(this.config.backoffMs / 1000),
      retryBackoff: true,
    };

    if (options?.delay !== undefined) {
      sendOptions.startAfter = Math.round(options.delay / 1000);
    }
    if (options?.priority !== undefined) {
      sendOptions.priority = options.priority;
    }
    if (options?.jobId !== undefined) {
      sendOptions.id = options.jobId;
    }
    if (options?.repeat !== undefined) {
      sendOptions.singletonKey = options.jobId;
      // Schedule recurring job via pg-boss schedule
      await boss.schedule(queue, options.repeat, payload as object, sendOptions);
      return options.jobId ?? queue;
    }

    const jobId = await boss.send(queue, payload as object, sendOptions);
    if (!jobId) {
      throw new Error(`Failed to enqueue job on queue "${queue}"`);
    }
    return jobId;
  }

  process(
    queue: string,
    handler: (payload: unknown, jobId: string) => Promise<unknown>
  ): void {
    this.ensureStarted().then((boss) => {
      boss.work(
        queue,
        { teamSize: this.config.concurrency, teamConcurrency: this.config.concurrency },
        async (job: PgBoss.Job<object>) => {
          const startedAt = Date.now();
          try {
            const result = await handler(job.data, job.id);
            const durationMs = Date.now() - startedAt;
            this.emit("onJobCompleted", {
              jobId: job.id,
              queue,
              durationMs,
            });
            return result;
          } catch (err) {
            const error = err instanceof Error ? err.message : String(err);
            const attempt = (job as unknown as { attemptCount?: number }).attemptCount ?? 1;
            const willRetry = attempt < this.config.maxAttempts;

            if (willRetry) {
              const nextDelayMs =
                this.config.backoffMs * Math.pow(2, attempt - 1);
              this.emit("onJobRetry", {
                jobId: job.id,
                attempt,
                nextDelayMs,
              });
            } else {
              this.emit("onJobFailed", {
                jobId: job.id,
                queue,
                error,
                attempt,
              });
            }
            throw err;
          }
        }
      );
    });
  }

  async getJob(jobId: string): Promise<JobResult | null> {
    const boss = await this.ensureStarted();
    const job = await boss.getJobById(jobId);
    if (!job) return null;

    return {
      id: job.id,
      queue: job.name,
      status: job.state as JobResult["status"],
      data: job.data,
      output: (job as unknown as { output?: unknown }).output,
      attempt: (job as unknown as { retryCount?: number }).retryCount ?? 0,
      createdOn: job.createdOn,
      completedOn: (job as unknown as { completedOn?: Date }).completedOn,
    };
  }

  async cancel(jobId: string): Promise<boolean> {
    const boss = await this.ensureStarted();
    try {
      await boss.cancel(jobId);
      return true;
    } catch {
      return false;
    }
  }

  async getStats(queue?: string): Promise<QueueStats> {
    const boss = await this.ensureStarted();

    if (queue) {
      const [waiting, active, completed, failed, delayed] = await Promise.all([
        boss.getQueueSize(queue, { before: "active" }).catch(() => 0),
        boss.getQueueSize(queue, { before: "completed" }).catch(() => 0),
        boss.getQueueSize(queue, { before: "expired" }).catch(() => 0),
        boss.getQueueSize(queue).catch(() => 0),
        boss.getQueueSize(queue, { before: "created" }).catch(() => 0),
      ]);

      return {
        waiting: waiting ?? 0,
        active: active ?? 0,
        completed: completed ?? 0,
        failed: failed ?? 0,
        delayed: delayed ?? 0,
      };
    }

    // No queue specified — aggregate stats are not directly available in pg-boss
    // Return zeroes as placeholder; callers should pass a queue name
    return { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 };
  }

  async stop(): Promise<void> {
    if (this.boss && this.started) {
      await this.boss.stop();
      this.started = false;
      this.boss = null;
    }
  }
}
