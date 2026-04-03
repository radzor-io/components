// @radzor/queue-worker — In-memory job queue with workers and retries

// ---- types ----

export interface QueueConfig {
  concurrency?: number;
  maxRetries?: number;
  retryDelay?: number;
}

export interface Job<T = unknown> {
  id: string;
  data: T;
  attempts: number;
  maxRetries: number;
  status: "pending" | "active" | "completed" | "failed";
  error?: string;
  createdAt: number;
  completedAt?: number;
}

type EventMap = {
  onJobComplete: Job;
  onJobFailed: Job;
  onError: { code: string; message: string };
};

// ---- implementation ----

export class QueueWorker<T = unknown> {
  private concurrency: number;
  private maxRetries: number;
  private retryDelay: number;
  private queue: Job<T>[] = [];
  private deadLetter: Job<T>[] = [];
  private activeCount = 0;
  private running = false;
  private processor?: (data: T) => Promise<void>;
  private idCounter = 0;
  private listeners: { [K in keyof EventMap]?: Array<(payload: EventMap[K]) => void> } = {};

  constructor(config: QueueConfig = {}) {
    this.concurrency = config.concurrency ?? 1;
    this.maxRetries = config.maxRetries ?? 3;
    this.retryDelay = config.retryDelay ?? 1000;
  }

  on<K extends keyof EventMap>(event: K, listener: (payload: EventMap[K]) => void): void {
    (this.listeners[event] ??= []).push(listener);
  }

  off<K extends keyof EventMap>(event: K, listener: (payload: EventMap[K]) => void): void {
    const arr = this.listeners[event];
    if (arr) this.listeners[event] = arr.filter((l) => l !== listener) as any;
  }

  private emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
    this.listeners[event]?.forEach((l) => l(payload));
  }

  addJob(data: T): Job<T> {
    const job: Job<T> = {
      id: `job_${++this.idCounter}_${Date.now()}`,
      data,
      attempts: 0,
      maxRetries: this.maxRetries,
      status: "pending",
      createdAt: Date.now(),
    };
    this.queue.push(job);
    if (this.running) this.tick();
    return job;
  }

  process(handler: (data: T) => Promise<void>): void {
    this.processor = handler;
  }

  start(): void {
    this.running = true;
    this.tick();
  }

  stop(): void {
    this.running = false;
  }

  getQueue(): Job<T>[] {
    return [...this.queue];
  }

  getDeadLetter(): Job<T>[] {
    return [...this.deadLetter];
  }

  private tick(): void {
    if (!this.running || !this.processor) return;

    while (this.activeCount < this.concurrency) {
      const job = this.queue.find((j) => j.status === "pending");
      if (!job) break;

      job.status = "active";
      this.activeCount++;
      this.processJob(job);
    }
  }

  private async processJob(job: Job<T>): Promise<void> {
    try {
      job.attempts++;
      await this.processor!(job.data);
      job.status = "completed";
      job.completedAt = Date.now();
      this.emit("onJobComplete", job as unknown as Job);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      job.error = message;

      if (job.attempts < job.maxRetries) {
        job.status = "pending";
        await new Promise((r) => setTimeout(r, this.retryDelay));
      } else {
        job.status = "failed";
        this.deadLetter.push(job);
        this.emit("onJobFailed", job as unknown as Job);
      }
    } finally {
      this.activeCount--;
      this.tick();
    }
  }
}
