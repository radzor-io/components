// @radzor/ab-test — Deterministic A/B testing with variant assignment and conversion tracking

export interface ExperimentDefinition {
  experimentId: string;
  variants: string[];
  trafficPercent: number; // 0-100
}

export interface ABTestConfig {
  experiments?: ExperimentDefinition[];
  salt?: string;
}

export interface VariantAssignment {
  experimentId: string;
  variant: string;
  userId: string;
  inExperiment: boolean;
}

export interface ConversionRecord {
  userId: string;
  variant: string;
  value: number;
  timestamp: number;
}

export interface VariantStats {
  variant: string;
  participants: number;
  conversions: number;
  conversionRate: number;
  totalValue: number;
  avgValue: number;
}

export interface ExperimentResults {
  experimentId: string;
  variants: VariantStats[];
  totalParticipants: number;
  totalConversions: number;
  significant: boolean;
}

export interface ConversionPayload {
  experimentId: string;
  variant: string;
  userId: string;
  value: number;
}

export type EventMap = {
  onConversion: ConversionPayload;
};

export type Listener<T> = (event: T) => void;

// ─── Hash ──────────────────────────────────────────────────

function djb2(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
    hash = hash >>> 0;
  }
  return hash;
}

// ─── Chi-squared significance test ─────────────────────────

function chiSquaredSignificant(observed: number[][], minPerCell: number = 30): boolean {
  const rows = observed.length;
  const cols = observed[0].length;

  const rowTotals = observed.map((row) => row.reduce((a, b) => a + b, 0));
  const colTotals: number[] = [];
  for (let j = 0; j < cols; j++) {
    let sum = 0;
    for (let i = 0; i < rows; i++) sum += observed[i][j];
    colTotals.push(sum);
  }
  const total = rowTotals.reduce((a, b) => a + b, 0);

  if (total === 0) return false;

  // Check minimum sample size
  for (const rt of rowTotals) {
    if (rt < minPerCell) return false;
  }

  let chiSq = 0;
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      const expected = (rowTotals[i] * colTotals[j]) / total;
      if (expected === 0) continue;
      const diff = observed[i][j] - expected;
      chiSq += (diff * diff) / expected;
    }
  }

  // df = (rows - 1) * (cols - 1)
  const df = (rows - 1) * (cols - 1);
  // Critical values for p < 0.05: df=1 → 3.84, df=2 → 5.99, df=3 → 7.81, etc.
  const criticalValues: Record<number, number> = {
    1: 3.841,
    2: 5.991,
    3: 7.815,
    4: 9.488,
    5: 11.07,
    6: 12.592,
    7: 14.067,
    8: 15.507,
    9: 16.919,
    10: 18.307,
  };

  const critical = criticalValues[df];
  if (!critical) return chiSq > 3.841; // fallback to df=1
  return chiSq > critical;
}

// ─── Class ─────────────────────────────────────────────────

export class ABTest {
  private salt: string;
  private experiments = new Map<string, ExperimentDefinition>();
  private assignments = new Map<string, Map<string, string>>(); // experimentId -> userId -> variant
  private conversions = new Map<string, ConversionRecord[]>(); // experimentId -> records
  private listeners: { [K in keyof EventMap]?: Listener<EventMap[K]>[] } = {};

  constructor(config: ABTestConfig = {}) {
    this.salt = config.salt ?? "radzor-ab";

    if (config.experiments) {
      for (const exp of config.experiments) {
        this.experiments.set(exp.experimentId, exp);
        this.assignments.set(exp.experimentId, new Map());
        this.conversions.set(exp.experimentId, []);
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

  createExperiment(experimentId: string, variants: string[], trafficPercent: number = 100): void {
    if (variants.length < 2) {
      throw new Error("An experiment must have at least 2 variants");
    }

    const definition: ExperimentDefinition = {
      experimentId,
      variants,
      trafficPercent: Math.max(0, Math.min(100, trafficPercent)),
    };

    this.experiments.set(experimentId, definition);
    this.assignments.set(experimentId, new Map());
    this.conversions.set(experimentId, []);
  }

  getVariant(experimentId: string, userId: string): VariantAssignment {
    const experiment = this.experiments.get(experimentId);
    if (!experiment) {
      throw new Error(`Experiment "${experimentId}" not found`);
    }

    // Check if already assigned
    const existing = this.assignments.get(experimentId)?.get(userId);
    if (existing) {
      return {
        experimentId,
        variant: existing,
        userId,
        inExperiment: true,
      };
    }

    // Determine if user is in the experiment (traffic allocation)
    const trafficHash = djb2(this.salt + ":traffic:" + experimentId + ":" + userId) % 100;
    if (trafficHash >= experiment.trafficPercent) {
      return {
        experimentId,
        variant: experiment.variants[0], // default/control
        userId,
        inExperiment: false,
      };
    }

    // Assign variant deterministically
    const variantHash = djb2(this.salt + ":variant:" + experimentId + ":" + userId);
    const variantIndex = variantHash % experiment.variants.length;
    const variant = experiment.variants[variantIndex];

    // Store assignment
    this.assignments.get(experimentId)!.set(userId, variant);

    return {
      experimentId,
      variant,
      userId,
      inExperiment: true,
    };
  }

  trackConversion(experimentId: string, userId: string, value: number = 1): void {
    const experiment = this.experiments.get(experimentId);
    if (!experiment) {
      throw new Error(`Experiment "${experimentId}" not found`);
    }

    // Get or create the assignment
    const assignment = this.getVariant(experimentId, userId);
    if (!assignment.inExperiment) return;

    const record: ConversionRecord = {
      userId,
      variant: assignment.variant,
      value,
      timestamp: Date.now(),
    };

    if (!this.conversions.has(experimentId)) {
      this.conversions.set(experimentId, []);
    }
    this.conversions.get(experimentId)!.push(record);

    this.emit("onConversion", {
      experimentId,
      variant: assignment.variant,
      userId,
      value,
    });
  }

  getResults(experimentId: string): ExperimentResults {
    const experiment = this.experiments.get(experimentId);
    if (!experiment) {
      throw new Error(`Experiment "${experimentId}" not found`);
    }

    const assignmentMap = this.assignments.get(experimentId) ?? new Map();
    const conversionRecords = this.conversions.get(experimentId) ?? [];

    // Build per-variant stats
    const variantParticipants = new Map<string, Set<string>>();
    const variantConversions = new Map<string, Set<string>>();
    const variantValues = new Map<string, number>();

    for (const v of experiment.variants) {
      variantParticipants.set(v, new Set());
      variantConversions.set(v, new Set());
      variantValues.set(v, 0);
    }

    for (const [userId, variant] of assignmentMap) {
      variantParticipants.get(variant)?.add(userId);
    }

    for (const record of conversionRecords) {
      variantConversions.get(record.variant)?.add(record.userId);
      variantValues.set(record.variant, (variantValues.get(record.variant) ?? 0) + record.value);
    }

    const variants: VariantStats[] = experiment.variants.map((variant) => {
      const participants = variantParticipants.get(variant)?.size ?? 0;
      const conversions = variantConversions.get(variant)?.size ?? 0;
      const totalValue = variantValues.get(variant) ?? 0;

      return {
        variant,
        participants,
        conversions,
        conversionRate: participants > 0 ? conversions / participants : 0,
        totalValue,
        avgValue: conversions > 0 ? totalValue / conversions : 0,
      };
    });

    const totalParticipants = variants.reduce((sum, v) => sum + v.participants, 0);
    const totalConversions = variants.reduce((sum, v) => sum + v.conversions, 0);

    // Statistical significance via chi-squared test
    const observed = variants.map((v) => [v.conversions, v.participants - v.conversions]);
    const significant = variants.length >= 2 ? chiSquaredSignificant(observed) : false;

    return {
      experimentId,
      variants,
      totalParticipants,
      totalConversions,
      significant,
    };
  }

  listExperiments(): string[] {
    return Array.from(this.experiments.keys());
  }
}

export default ABTest;
