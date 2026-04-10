// @radzor/guardrails — Validate LLM inputs/outputs against safety rules (PII, content filtering, length limits)

export interface GuardrailsConfig {
  enableBuiltinRules?: boolean;
  maxInputLength?: number;
  maxOutputLength?: number;
}

export type Severity = "error" | "warning" | "info";
export type Direction = "input" | "output" | "both";

export interface GuardrailRule {
  name: string;
  description: string;
  severity: Severity;
  direction: Direction;
  patterns?: RegExp[];
  keywords?: string[];
  validator?: (text: string) => Violation | null;
}

export interface Violation {
  rule: string;
  severity: Severity;
  message: string;
  matches?: string[];
}

export interface ValidationResult {
  passed: boolean;
  violations: Violation[];
}

export interface RuleInfo {
  name: string;
  description: string;
  severity: Severity;
  direction: Direction;
  type: "pattern" | "keyword" | "custom" | "mixed";
}

export type EventMap = {
  onViolation: { rule: string; severity: string; text: string; direction: string };
};

export type Listener<T> = (event: T) => void;

// ─── Built-in PII patterns ────────────────────────────────

const PII_PATTERNS: Array<{ name: string; pattern: RegExp; label: string }> = [
  { name: "email", pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, label: "email address" },
  { name: "phone_us", pattern: /\b(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g, label: "US phone number" },
  { name: "ssn", pattern: /\b\d{3}[-.\s]?\d{2}[-.\s]?\d{4}\b/g, label: "SSN-like number" },
  { name: "credit_card", pattern: /\b(?:\d{4}[-.\s]?){3}\d{4}\b/g, label: "credit card number" },
  { name: "ip_address", pattern: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g, label: "IP address" },
];

const INJECTION_PATTERNS: RegExp[] = [
  /ignore\s+(all\s+)?previous\s+instructions/i,
  /disregard\s+(all\s+)?(prior|previous|above)\s+(instructions|rules|guidelines)/i,
  /you\s+are\s+now\s+(a|an)\s+/i,
  /\bsystem\s*:\s*/i,
  /\bpretend\s+you\s+are\b/i,
  /\bact\s+as\s+if\s+you\b/i,
  /\brole\s*play\s+as\b/i,
  /\bdo\s+not\s+follow\s+(your|the)\s+(rules|guidelines|instructions)\b/i,
  /\boverride\s+(your|the)\s+(system|safety)\b/i,
  /\bjailbreak\b/i,
];

export class Guardrails {
  private config: {
    enableBuiltinRules: boolean;
    maxInputLength: number;
    maxOutputLength: number;
  };
  private rules: GuardrailRule[] = [];
  private listeners: { [K in keyof EventMap]?: Listener<EventMap[K]>[] } = {};

  constructor(config?: GuardrailsConfig) {
    this.config = {
      enableBuiltinRules: config?.enableBuiltinRules ?? true,
      maxInputLength: config?.maxInputLength ?? 50000,
      maxOutputLength: config?.maxOutputLength ?? 100000,
    };

    if (this.config.enableBuiltinRules) {
      this.loadBuiltinRules();
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

  /** Validate input text (user prompt) against all active rules. */
  validateInput(text: string): ValidationResult {
    return this.validate(text, "input");
  }

  /** Validate output text (LLM response) against all active rules. */
  validateOutput(text: string): ValidationResult {
    return this.validate(text, "output");
  }

  /** Add a custom validation rule. */
  addRule(rule: GuardrailRule): void {
    if (this.rules.some((r) => r.name === rule.name)) {
      throw new Error(`Rule "${rule.name}" already exists`);
    }
    this.rules.push(rule);
  }

  /** List all active validation rules. */
  listRules(): RuleInfo[] {
    return this.rules.map((r) => ({
      name: r.name,
      description: r.description,
      severity: r.severity,
      direction: r.direction,
      type: r.validator
        ? r.patterns || r.keywords
          ? "mixed"
          : "custom"
        : r.patterns
          ? "pattern"
          : "keyword",
    }));
  }

  // ─── Core validation ────────────────────────────────────

  private validate(text: string, direction: "input" | "output"): ValidationResult {
    const violations: Violation[] = [];

    // Length check
    const maxLen = direction === "input" ? this.config.maxInputLength : this.config.maxOutputLength;
    if (text.length > maxLen) {
      violations.push({
        rule: `max_${direction}_length`,
        severity: "error",
        message: `Text exceeds maximum ${direction} length of ${maxLen} characters (got ${text.length})`,
      });
    }

    // Run rules applicable to this direction
    for (const rule of this.rules) {
      if (rule.direction !== direction && rule.direction !== "both") continue;

      // Pattern-based check
      if (rule.patterns) {
        const allMatches: string[] = [];
        for (const pattern of rule.patterns) {
          const regex = new RegExp(pattern.source, pattern.flags);
          const matches = text.match(regex);
          if (matches) allMatches.push(...matches);
        }
        if (allMatches.length > 0) {
          const violation: Violation = {
            rule: rule.name,
            severity: rule.severity,
            message: `${rule.description}: found ${allMatches.length} match(es)`,
            matches: allMatches.slice(0, 10), // Limit to first 10
          };
          violations.push(violation);
          this.emit("onViolation", {
            rule: rule.name,
            severity: rule.severity,
            text: text.slice(0, 200),
            direction,
          });
        }
      }

      // Keyword-based check
      if (rule.keywords) {
        const lower = text.toLowerCase();
        const found = rule.keywords.filter((kw) => lower.includes(kw.toLowerCase()));
        if (found.length > 0) {
          const violation: Violation = {
            rule: rule.name,
            severity: rule.severity,
            message: `${rule.description}: found keywords [${found.join(", ")}]`,
            matches: found,
          };
          violations.push(violation);
          this.emit("onViolation", {
            rule: rule.name,
            severity: rule.severity,
            text: text.slice(0, 200),
            direction,
          });
        }
      }

      // Custom validator
      if (rule.validator) {
        const result = rule.validator(text);
        if (result) {
          violations.push(result);
          this.emit("onViolation", {
            rule: rule.name,
            severity: result.severity,
            text: text.slice(0, 200),
            direction,
          });
        }
      }
    }

    return {
      passed: violations.filter((v) => v.severity === "error").length === 0,
      violations,
    };
  }

  // ─── Built-in rules ─────────────────────────────────────

  private loadBuiltinRules(): void {
    // PII detection
    this.rules.push({
      name: "pii_detection",
      description: "Detected personally identifiable information",
      severity: "error",
      direction: "both",
      patterns: PII_PATTERNS.map((p) => p.pattern),
    });

    // Prompt injection detection (input only)
    this.rules.push({
      name: "prompt_injection",
      description: "Detected potential prompt injection attempt",
      severity: "error",
      direction: "input",
      patterns: INJECTION_PATTERNS,
    });

    // Profanity / toxic content (basic keyword list)
    this.rules.push({
      name: "toxic_content",
      description: "Detected potentially toxic or harmful content",
      severity: "warning",
      direction: "both",
      validator: (text: string): Violation | null => {
        const toxicPatterns = [
          /\b(kill|murder|attack)\s+(yourself|himself|herself|themselves|people)\b/i,
          /\bhow\s+to\s+(make|build|create)\s+(a\s+)?(bomb|weapon|explosive)\b/i,
          /\b(hack|exploit|breach)\s+(into|a|the)\b/i,
        ];
        const matches: string[] = [];
        for (const pattern of toxicPatterns) {
          const m = text.match(pattern);
          if (m) matches.push(m[0]);
        }
        if (matches.length > 0) {
          return {
            rule: "toxic_content",
            severity: "warning",
            message: `Detected potentially harmful content patterns`,
            matches,
          };
        }
        return null;
      },
    });

    // Empty content check
    this.rules.push({
      name: "empty_content",
      description: "Text is empty or whitespace-only",
      severity: "warning",
      direction: "both",
      validator: (text: string): Violation | null => {
        if (text.trim().length === 0) {
          return {
            rule: "empty_content",
            severity: "warning",
            message: "Text is empty or contains only whitespace",
          };
        }
        return null;
      },
    });

    // Repetition detection (output quality check)
    this.rules.push({
      name: "excessive_repetition",
      description: "Output contains excessive repetition (possible LLM loop)",
      severity: "warning",
      direction: "output",
      validator: (text: string): Violation | null => {
        if (text.length < 100) return null;
        // Check for repeated sentences
        const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 10);
        const seen = new Map<string, number>();
        for (const s of sentences) {
          const normalized = s.trim().toLowerCase();
          seen.set(normalized, (seen.get(normalized) ?? 0) + 1);
        }
        const repeated = Array.from(seen.entries()).filter(([, count]) => count >= 3);
        if (repeated.length > 0) {
          return {
            rule: "excessive_repetition",
            severity: "warning",
            message: `Detected ${repeated.length} sentence(s) repeated 3+ times — possible LLM loop`,
            matches: repeated.map(([s]) => s.slice(0, 80)),
          };
        }
        return null;
      },
    });
  }
}

export default Guardrails;
