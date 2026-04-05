// @radzor/feature-flag — Zero-dependency feature flags with percentage rollout and env overrides

export type FlagValue = boolean | string | number;

export interface FeatureFlagConfig {
  flags: Record<string, FlagValue>;
  overrideEnv?: boolean;
  overrideHeader?: string;
}

export interface Evaluation {
  flag: string;
  value: FlagValue;
  reason: "static" | "percentage" | "env-override" | "runtime-override" | "default";
}

export interface FlagEnabledEvent {
  flag: string;
  userId?: string;
}

export interface FlagDisabledEvent {
  flag: string;
  userId?: string;
}

export interface OverrideEvent {
  flag: string;
  value: FlagValue;
  previous: FlagValue | undefined;
}

type EventMap = {
  onFlagEnabled: FlagEnabledEvent;
  onFlagDisabled: FlagDisabledEvent;
  onOverride: OverrideEvent;
};

type Listener<T> = (event: T) => void;

// djb2 hash — deterministic, fast, good distribution for rollout
function djb2(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
    hash = hash >>> 0; // keep unsigned 32-bit
  }
  return hash;
}

function rolloutBucket(flagName: string, userId: string): number {
  return djb2(flagName + userId) % 100;
}

function parseEnvValue(raw: string): FlagValue {
  if (raw === "true") return true;
  if (raw === "false") return false;
  const num = Number(raw);
  if (!isNaN(num) && raw.trim() !== "") return num;
  return raw;
}

function envKey(flagName: string): string {
  return `FF_${flagName.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`;
}

export class FeatureFlags {
  private config: Required<FeatureFlagConfig>;
  private overrides: Map<string, FlagValue> = new Map();
  private listeners: { [K in keyof EventMap]?: Listener<EventMap[K]>[] } = {};

  constructor(config: FeatureFlagConfig) {
    this.config = {
      flags: config.flags,
      overrideEnv: config.overrideEnv ?? true,
      overrideHeader: config.overrideHeader ?? "",
    };
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

  private evaluate(flagName: string, userId?: string): Evaluation {
    const baseValue = this.config.flags[flagName];

    // 1. Runtime override takes highest priority
    if (this.overrides.has(flagName)) {
      return { flag: flagName, value: this.overrides.get(flagName)!, reason: "runtime-override" };
    }

    // 2. Environment variable override (FF_FLAG_NAME)
    if (this.config.overrideEnv && typeof process !== "undefined") {
      const envVal = process.env[envKey(flagName)];
      if (envVal !== undefined) {
        return { flag: flagName, value: parseEnvValue(envVal), reason: "env-override" };
      }
    }

    // 3. Percentage rollout: if the flag value is a number 0-100 and userId is provided
    if (typeof baseValue === "number" && baseValue >= 0 && baseValue <= 100 && userId) {
      const bucket = rolloutBucket(flagName, userId);
      const enabled = bucket < baseValue;
      return { flag: flagName, value: enabled, reason: "percentage" };
    }

    // 4. Static value from config
    if (baseValue !== undefined) {
      return { flag: flagName, value: baseValue, reason: "static" };
    }

    return { flag: flagName, value: false, reason: "default" };
  }

  isEnabled(flag: string, userId?: string): boolean {
    const eval_ = this.evaluate(flag, userId);
    const enabled = Boolean(eval_.value);

    if (enabled) {
      this.emit("onFlagEnabled", { flag, userId });
    } else {
      this.emit("onFlagDisabled", { flag, userId });
    }

    return enabled;
  }

  getValue(flag: string, defaultValue?: FlagValue): FlagValue {
    const eval_ = this.evaluate(flag);
    if (eval_.reason === "default" && defaultValue !== undefined) {
      return defaultValue;
    }
    return eval_.value;
  }

  setOverride(flag: string, value: FlagValue): void {
    const previous = this.overrides.get(flag) ?? this.config.flags[flag];
    this.overrides.set(flag, value);
    this.emit("onOverride", { flag, value, previous });
  }

  clearOverride(flag: string): void {
    this.overrides.delete(flag);
  }

  clearAllOverrides(): void {
    this.overrides.clear();
  }

  getAll(userId?: string): Record<string, FlagValue> {
    const result: Record<string, FlagValue> = {};
    for (const flag of Object.keys(this.config.flags)) {
      const eval_ = this.evaluate(flag, userId);
      // For percentage flags evaluated with userId, return boolean; otherwise raw value
      result[flag] = eval_.value;
    }
    return result;
  }
}

export default FeatureFlags;
