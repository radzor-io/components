// @radzor/user-segmentation — Segment users based on attribute rules and behavioral filters

export type Operator =
  | "eq"
  | "neq"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "in"
  | "notIn"
  | "contains"
  | "startsWith"
  | "endsWith"
  | "exists"
  | "regex";

export interface SegmentRule {
  field: string;
  operator: Operator;
  value: unknown;
}

export interface SegmentDefinition {
  segmentId: string;
  name: string;
  rules: SegmentRule[];
}

export interface SegmentResult {
  userId: string;
  matchedSegments: string[];
  evaluatedAt: number;
}

export interface UserSegmentationConfig {
  segments?: SegmentDefinition[];
}

export type EventMap = {};

export type Listener<T> = (event: T) => void;

// ─── Rule evaluation ──────────────────────────────────────

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function evaluateRule(attributes: Record<string, unknown>, rule: SegmentRule): boolean {
  const actual = getNestedValue(attributes, rule.field);
  const expected = rule.value;

  switch (rule.operator) {
    case "eq":
      return actual === expected;

    case "neq":
      return actual !== expected;

    case "gt":
      return typeof actual === "number" && typeof expected === "number" && actual > expected;

    case "gte":
      return typeof actual === "number" && typeof expected === "number" && actual >= expected;

    case "lt":
      return typeof actual === "number" && typeof expected === "number" && actual < expected;

    case "lte":
      return typeof actual === "number" && typeof expected === "number" && actual <= expected;

    case "in":
      if (!Array.isArray(expected)) return false;
      return expected.includes(actual);

    case "notIn":
      if (!Array.isArray(expected)) return false;
      return !expected.includes(actual);

    case "contains":
      if (typeof actual === "string" && typeof expected === "string") {
        return actual.includes(expected);
      }
      if (Array.isArray(actual)) {
        return actual.includes(expected);
      }
      return false;

    case "startsWith":
      return typeof actual === "string" && typeof expected === "string" && actual.startsWith(expected);

    case "endsWith":
      return typeof actual === "string" && typeof expected === "string" && actual.endsWith(expected);

    case "exists":
      return expected ? actual !== undefined && actual !== null : actual === undefined || actual === null;

    case "regex":
      if (typeof actual !== "string" || typeof expected !== "string") return false;
      try {
        return new RegExp(expected).test(actual);
      } catch {
        return false;
      }

    default:
      return false;
  }
}

function evaluateSegment(attributes: Record<string, unknown>, segment: SegmentDefinition): boolean {
  // All rules must match (AND logic)
  return segment.rules.every((rule) => evaluateRule(attributes, rule));
}

// ─── Class ────────────────────────────────────────────────

export class UserSegmentation {
  private segments = new Map<string, SegmentDefinition>();
  private cache = new Map<string, SegmentResult>();
  private listeners: { [K in keyof EventMap]?: Listener<EventMap[K]>[] } = {};

  constructor(config: UserSegmentationConfig = {}) {
    if (config.segments) {
      for (const seg of config.segments) {
        this.segments.set(seg.segmentId, seg);
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

  defineSegment(segmentId: string, name: string, rules: SegmentRule[]): void {
    if (rules.length === 0) {
      throw new Error("A segment must have at least one rule");
    }

    const definition: SegmentDefinition = { segmentId, name, rules };
    this.segments.set(segmentId, definition);
  }

  evaluate(userId: string, attributes: Record<string, unknown>): SegmentResult {
    const matchedSegments: string[] = [];

    for (const [segmentId, segment] of this.segments) {
      if (evaluateSegment(attributes, segment)) {
        matchedSegments.push(segmentId);
      }
    }

    const result: SegmentResult = {
      userId,
      matchedSegments,
      evaluatedAt: Date.now(),
    };

    this.cache.set(userId, result);
    return result;
  }

  listSegments(): SegmentDefinition[] {
    return Array.from(this.segments.values());
  }

  getUserSegments(userId: string): string[] {
    const cached = this.cache.get(userId);
    return cached ? cached.matchedSegments : [];
  }

  removeSegment(segmentId: string): boolean {
    return this.segments.delete(segmentId);
  }

  clearCache(): void {
    this.cache.clear();
  }

  getCacheSize(): number {
    return this.cache.size;
  }
}

export default UserSegmentation;
