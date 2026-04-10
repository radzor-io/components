// @radzor/data-validator — Validate data against schemas (JSON Schema subset, custom rules)

export interface DataValidatorConfig {
  coerceTypes?: boolean;
  allErrors?: boolean;
}

export type SchemaType = "string" | "number" | "boolean" | "object" | "array" | "null" | "any";

export interface SchemaDefinition {
  type: SchemaType | SchemaType[];
  required?: string[];
  properties?: Record<string, SchemaDefinition>;
  items?: SchemaDefinition;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  enum?: unknown[];
  default?: unknown;
  description?: string;
  nullable?: boolean;
  custom?: (value: unknown, path: string) => string | null;
}

export interface ValidationError {
  path: string;
  message: string;
  rule: string;
  expected?: unknown;
  received?: unknown;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  coerced: unknown;
}

export interface CoerceResult {
  data: unknown;
  coerced: boolean;
  changes: string[];
}

export type EventMap = {
  onValidationFailed: { schemaName: string; errorCount: number; firstError: string };
};

export type Listener<T> = (event: T) => void;

export class DataValidator {
  private config: { coerceTypes: boolean; allErrors: boolean };
  private schemas: Map<string, SchemaDefinition> = new Map();
  private listeners: { [K in keyof EventMap]?: Listener<EventMap[K]>[] } = {};

  constructor(config?: DataValidatorConfig) {
    this.config = {
      coerceTypes: config?.coerceTypes ?? false,
      allErrors: config?.allErrors ?? true,
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

  /** Register a named schema for reuse. */
  addSchema(name: string, schema: SchemaDefinition): void {
    this.schemas.set(name, schema);
  }

  /** List all registered schema names. */
  listSchemas(): string[] {
    return Array.from(this.schemas.keys());
  }

  /** Validate data against a schema. */
  validate(data: unknown, schema: string | SchemaDefinition): ValidationResult {
    const schemaDef = this.resolveSchema(schema);
    const schemaName = typeof schema === "string" ? schema : "<inline>";
    const errors: ValidationError[] = [];

    let coerced = this.config.coerceTypes ? this.deepClone(data) : data;

    if (this.config.coerceTypes) {
      const coerceResult = this.coerceValue(coerced, schemaDef, "");
      coerced = coerceResult.value;
    }

    this.validateValue(coerced, schemaDef, "", errors);

    if (errors.length > 0) {
      this.emit("onValidationFailed", {
        schemaName,
        errorCount: errors.length,
        firstError: errors[0].message,
      });
    }

    return {
      valid: errors.length === 0,
      errors,
      coerced,
    };
  }

  /** Attempt to coerce data to match schema types without full validation. */
  coerce(data: unknown, schema: string | SchemaDefinition): CoerceResult {
    const schemaDef = this.resolveSchema(schema);
    const cloned = this.deepClone(data);
    const changes: string[] = [];
    const result = this.coerceValue(cloned, schemaDef, "", changes);

    return {
      data: result.value,
      coerced: changes.length > 0,
      changes,
    };
  }

  // ─── Core validation ───────────────────────────────────

  private validateValue(
    value: unknown,
    schema: SchemaDefinition,
    path: string,
    errors: ValidationError[]
  ): void {
    if (!this.config.allErrors && errors.length > 0) return;

    // Handle nullable
    if (value === null && schema.nullable) return;

    // Type check
    if (schema.type && schema.type !== "any") {
      const types = Array.isArray(schema.type) ? schema.type : [schema.type];
      const actualType = this.getType(value);
      if (!types.includes(actualType) && !(schema.nullable && value === null)) {
        errors.push({
          path: path || "/",
          message: `Expected type ${types.join(" | ")}, got ${actualType}`,
          rule: "type",
          expected: schema.type,
          received: actualType,
        });
        return;
      }
    }

    // Enum check
    if (schema.enum) {
      if (!schema.enum.includes(value)) {
        errors.push({
          path: path || "/",
          message: `Value must be one of: ${schema.enum.map((v) => JSON.stringify(v)).join(", ")}`,
          rule: "enum",
          expected: schema.enum,
          received: value,
        });
      }
    }

    // String checks
    if (typeof value === "string") {
      if (schema.minLength !== undefined && value.length < schema.minLength) {
        errors.push({
          path: path || "/",
          message: `String length ${value.length} is less than minimum ${schema.minLength}`,
          rule: "minLength",
          expected: schema.minLength,
          received: value.length,
        });
      }
      if (schema.maxLength !== undefined && value.length > schema.maxLength) {
        errors.push({
          path: path || "/",
          message: `String length ${value.length} exceeds maximum ${schema.maxLength}`,
          rule: "maxLength",
          expected: schema.maxLength,
          received: value.length,
        });
      }
      if (schema.pattern) {
        const regex = new RegExp(schema.pattern);
        if (!regex.test(value)) {
          errors.push({
            path: path || "/",
            message: `String does not match pattern "${schema.pattern}"`,
            rule: "pattern",
            expected: schema.pattern,
            received: value,
          });
        }
      }
    }

    // Number checks
    if (typeof value === "number") {
      if (schema.minimum !== undefined && value < schema.minimum) {
        errors.push({
          path: path || "/",
          message: `Value ${value} is less than minimum ${schema.minimum}`,
          rule: "minimum",
          expected: schema.minimum,
          received: value,
        });
      }
      if (schema.maximum !== undefined && value > schema.maximum) {
        errors.push({
          path: path || "/",
          message: `Value ${value} exceeds maximum ${schema.maximum}`,
          rule: "maximum",
          expected: schema.maximum,
          received: value,
        });
      }
    }

    // Object checks
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      const obj = value as Record<string, unknown>;

      // Required fields
      if (schema.required) {
        for (const field of schema.required) {
          if (!(field in obj)) {
            errors.push({
              path: `${path}/${field}`,
              message: `Missing required field "${field}"`,
              rule: "required",
              expected: field,
            });
          }
        }
      }

      // Validate properties
      if (schema.properties) {
        for (const [key, propSchema] of Object.entries(schema.properties)) {
          if (key in obj) {
            this.validateValue(obj[key], propSchema, `${path}/${key}`, errors);
          }
        }
      }
    }

    // Array checks
    if (Array.isArray(value) && schema.items) {
      for (let i = 0; i < value.length; i++) {
        this.validateValue(value[i], schema.items, `${path}/${i}`, errors);
      }
    }

    // Custom validator
    if (schema.custom) {
      const error = schema.custom(value, path);
      if (error) {
        errors.push({
          path: path || "/",
          message: error,
          rule: "custom",
        });
      }
    }
  }

  // ─── Coercion ─────────────────────────────────────────

  private coerceValue(
    value: unknown,
    schema: SchemaDefinition,
    path: string,
    changes: string[] = []
  ): { value: unknown } {
    const targetType = Array.isArray(schema.type) ? schema.type[0] : schema.type;

    if (targetType === "string" && typeof value !== "string" && value !== null) {
      changes.push(`${path || "/"}: ${typeof value} → string`);
      return { value: String(value) };
    }

    if (targetType === "number" && typeof value === "string") {
      const num = Number(value);
      if (!isNaN(num)) {
        changes.push(`${path || "/"}: string → number`);
        return { value: num };
      }
    }

    if (targetType === "boolean" && typeof value === "string") {
      if (value === "true" || value === "1") {
        changes.push(`${path || "/"}: string → boolean (true)`);
        return { value: true };
      }
      if (value === "false" || value === "0") {
        changes.push(`${path || "/"}: string → boolean (false)`);
        return { value: false };
      }
    }

    // Apply defaults
    if (value === undefined && schema.default !== undefined) {
      changes.push(`${path || "/"}: undefined → default`);
      return { value: schema.default };
    }

    // Recurse into objects
    if (
      typeof value === "object" &&
      value !== null &&
      !Array.isArray(value) &&
      schema.properties
    ) {
      const obj = { ...(value as Record<string, unknown>) };
      for (const [key, propSchema] of Object.entries(schema.properties)) {
        const result = this.coerceValue(obj[key], propSchema, `${path}/${key}`, changes);
        obj[key] = result.value;
      }
      return { value: obj };
    }

    // Recurse into arrays
    if (Array.isArray(value) && schema.items) {
      const arr = value.map((item, i) => {
        return this.coerceValue(item, schema.items!, `${path}/${i}`, changes).value;
      });
      return { value: arr };
    }

    return { value };
  }

  // ─── Helpers ──────────────────────────────────────────

  private resolveSchema(schema: string | SchemaDefinition): SchemaDefinition {
    if (typeof schema === "string") {
      const resolved = this.schemas.get(schema);
      if (!resolved) throw new Error(`Schema "${schema}" is not registered`);
      return resolved;
    }
    return schema;
  }

  private getType(value: unknown): SchemaType {
    if (value === null) return "null";
    if (Array.isArray(value)) return "array";
    return typeof value as SchemaType;
  }

  private deepClone(value: unknown): unknown {
    if (value === null || typeof value !== "object") return value;
    if (Array.isArray(value)) return value.map((v) => this.deepClone(v));
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      result[k] = this.deepClone(v);
    }
    return result;
  }
}

export default DataValidator;
