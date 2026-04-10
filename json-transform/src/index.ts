// @radzor/json-transform — Transform JSON data using JSONPath expressions, mapping rules, and templates

export interface JsonTransformConfig {
  strictMode?: boolean;
}

export type TransformOp = "pick" | "omit" | "rename" | "set" | "delete" | "compute";

export interface TransformRule {
  op: TransformOp;
  path?: string;
  from?: string;
  to?: string;
  value?: unknown;
  fields?: string[];
  fn?: (value: unknown, root: unknown) => unknown;
}

export interface TransformResult {
  data: unknown;
  metadata: {
    inputKeys: number;
    outputKeys: number;
    transformations: number;
  };
}

export type FilterOperator = "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "contains" | "startsWith" | "endsWith" | "in" | "exists";

export interface FilterPredicate {
  field: string;
  operator: FilterOperator;
  value?: unknown;
}

export type EventMap = Record<string, never>;
export type Listener<T> = (event: T) => void;

export class JsonTransform {
  private config: { strictMode: boolean };

  constructor(config?: JsonTransformConfig) {
    this.config = {
      strictMode: config?.strictMode ?? false,
    };
  }

  on(): void { /* No events */ }
  off(): void { /* No events */ }

  /** Apply a sequence of transformation rules to input data. */
  transform(data: unknown, rules: TransformRule[]): TransformResult {
    const inputKeys = this.countKeys(data);
    let current = this.deepClone(data);

    for (const rule of rules) {
      current = this.applyRule(current, rule);
    }

    return {
      data: current,
      metadata: {
        inputKeys,
        outputKeys: this.countKeys(current),
        transformations: rules.length,
      },
    };
  }

  /** Map fields from input to output using dot-path expressions. */
  map(data: Record<string, unknown>, mapping: Record<string, string>): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const [outputKey, sourcePath] of Object.entries(mapping)) {
      const value = this.getByPath(data, sourcePath);
      if (value === undefined && this.config.strictMode) {
        throw new Error(`Path "${sourcePath}" not found in source data`);
      }
      this.setByPath(result, outputKey, value);
    }

    return result;
  }

  /** Filter an array of objects based on a predicate. */
  filter(data: unknown[], predicate: FilterPredicate): unknown[] {
    return data.filter((item) => {
      const value = this.getByPath(item as Record<string, unknown>, predicate.field);
      return this.evaluatePredicate(value, predicate.operator, predicate.value);
    });
  }

  /** Flatten a nested object into a single-level object. */
  flatten(data: Record<string, unknown>, separator: string = "."): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    const recurse = (obj: unknown, prefix: string) => {
      if (obj === null || obj === undefined) {
        result[prefix] = obj;
        return;
      }

      if (Array.isArray(obj)) {
        for (let i = 0; i < obj.length; i++) {
          recurse(obj[i], prefix ? `${prefix}${separator}${i}` : String(i));
        }
        if (obj.length === 0) {
          result[prefix] = [];
        }
        return;
      }

      if (typeof obj === "object") {
        const entries = Object.entries(obj as Record<string, unknown>);
        if (entries.length === 0) {
          result[prefix] = {};
          return;
        }
        for (const [key, val] of entries) {
          recurse(val, prefix ? `${prefix}${separator}${key}` : key);
        }
        return;
      }

      result[prefix] = obj;
    };

    recurse(data, "");
    return result;
  }

  /** Deep-merge multiple objects. Arrays are concatenated, objects are merged recursively. */
  merge(objects: Record<string, unknown>[]): Record<string, unknown> {
    if (objects.length === 0) return {};

    const result = this.deepClone(objects[0]) as Record<string, unknown>;

    for (let i = 1; i < objects.length; i++) {
      this.deepMergeInto(result, objects[i]);
    }

    return result;
  }

  // ─── Rule application ──────────────────────────────────

  private applyRule(data: unknown, rule: TransformRule): unknown {
    if (typeof data !== "object" || data === null) {
      if (this.config.strictMode) throw new Error(`Cannot apply "${rule.op}" to non-object data`);
      return data;
    }

    const obj = data as Record<string, unknown>;

    switch (rule.op) {
      case "pick": {
        if (!rule.fields) return obj;
        const result: Record<string, unknown> = {};
        for (const field of rule.fields) {
          const value = this.getByPath(obj, field);
          if (value !== undefined) this.setByPath(result, field, value);
        }
        return result;
      }

      case "omit": {
        if (!rule.fields) return obj;
        const result = this.deepClone(obj) as Record<string, unknown>;
        for (const field of rule.fields) {
          this.deleteByPath(result, field);
        }
        return result;
      }

      case "rename": {
        if (!rule.from || !rule.to) return obj;
        const result = this.deepClone(obj) as Record<string, unknown>;
        const value = this.getByPath(result, rule.from);
        if (value !== undefined) {
          this.deleteByPath(result, rule.from);
          this.setByPath(result, rule.to, value);
        }
        return result;
      }

      case "set": {
        if (!rule.path) return obj;
        const result = this.deepClone(obj) as Record<string, unknown>;
        this.setByPath(result, rule.path, rule.value);
        return result;
      }

      case "delete": {
        if (!rule.path) return obj;
        const result = this.deepClone(obj) as Record<string, unknown>;
        this.deleteByPath(result, rule.path);
        return result;
      }

      case "compute": {
        if (!rule.path || !rule.fn) return obj;
        const result = this.deepClone(obj) as Record<string, unknown>;
        const current = this.getByPath(result, rule.path);
        this.setByPath(result, rule.path, rule.fn(current, result));
        return result;
      }

      default:
        return obj;
    }
  }

  // ─── Path helpers ──────────────────────────────────────

  private getByPath(obj: Record<string, unknown>, path: string): unknown {
    const parts = path.split(".");
    let current: unknown = obj;

    for (const part of parts) {
      if (current === null || current === undefined) return undefined;

      // Handle array index: items[0]
      const arrayMatch = part.match(/^(\w+)\[(\d+)\]$/);
      if (arrayMatch) {
        current = (current as Record<string, unknown>)[arrayMatch[1]];
        if (Array.isArray(current)) {
          current = current[parseInt(arrayMatch[2], 10)];
        } else {
          return undefined;
        }
      } else {
        current = (current as Record<string, unknown>)[part];
      }
    }

    return current;
  }

  private setByPath(obj: Record<string, unknown>, path: string, value: unknown): void {
    const parts = path.split(".");
    let current: Record<string, unknown> = obj;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!(part in current) || typeof current[part] !== "object" || current[part] === null) {
        current[part] = {};
      }
      current = current[part] as Record<string, unknown>;
    }

    current[parts[parts.length - 1]] = value;
  }

  private deleteByPath(obj: Record<string, unknown>, path: string): void {
    const parts = path.split(".");
    let current: Record<string, unknown> = obj;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!(part in current) || typeof current[part] !== "object") return;
      current = current[part] as Record<string, unknown>;
    }

    delete current[parts[parts.length - 1]];
  }

  // ─── Predicate evaluation ─────────────────────────────

  private evaluatePredicate(value: unknown, operator: FilterOperator, target?: unknown): boolean {
    switch (operator) {
      case "eq": return value === target;
      case "neq": return value !== target;
      case "gt": return typeof value === "number" && typeof target === "number" && value > target;
      case "gte": return typeof value === "number" && typeof target === "number" && value >= target;
      case "lt": return typeof value === "number" && typeof target === "number" && value < target;
      case "lte": return typeof value === "number" && typeof target === "number" && value <= target;
      case "contains":
        return typeof value === "string" && typeof target === "string" && value.includes(target);
      case "startsWith":
        return typeof value === "string" && typeof target === "string" && value.startsWith(target);
      case "endsWith":
        return typeof value === "string" && typeof target === "string" && value.endsWith(target);
      case "in":
        return Array.isArray(target) && target.includes(value);
      case "exists":
        return value !== undefined && value !== null;
      default:
        return false;
    }
  }

  // ─── Utility ──────────────────────────────────────────

  private deepClone(obj: unknown): unknown {
    if (obj === null || typeof obj !== "object") return obj;
    if (Array.isArray(obj)) return obj.map((item) => this.deepClone(item));
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
      result[key] = this.deepClone(val);
    }
    return result;
  }

  private deepMergeInto(target: Record<string, unknown>, source: Record<string, unknown>): void {
    for (const [key, val] of Object.entries(source)) {
      if (
        val !== null &&
        typeof val === "object" &&
        !Array.isArray(val) &&
        key in target &&
        typeof target[key] === "object" &&
        target[key] !== null &&
        !Array.isArray(target[key])
      ) {
        this.deepMergeInto(
          target[key] as Record<string, unknown>,
          val as Record<string, unknown>
        );
      } else if (Array.isArray(val) && Array.isArray(target[key])) {
        target[key] = [...(target[key] as unknown[]), ...val];
      } else {
        target[key] = this.deepClone(val);
      }
    }
  }

  private countKeys(data: unknown): number {
    if (data === null || typeof data !== "object") return 0;
    if (Array.isArray(data)) return data.length;
    return Object.keys(data as Record<string, unknown>).length;
  }
}

export default JsonTransform;
