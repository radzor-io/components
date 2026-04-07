import { parse } from "csv-parse";
import { Readable } from "stream";

export interface CsvImportConfig {
  delimiter?: string;
  hasHeader?: boolean;
  encoding?: BufferEncoding;
  batchSize?: number;
  skipEmptyRows?: boolean;
  schema?: Record<string, "string" | "number" | "boolean" | "date">;
}

export interface ParseStats {
  totalRows: number;
  validRows: number;
  errorRows: number;
  durationMs: number;
}

export interface ValidationResult {
  valid: Record<string, unknown>[];
  errors: Array<{ row: number; field: string; message: string }>;
}

export type EventMap = {
  onRow: { row: Record<string, unknown>; index: number };
  onBatch: { rows: Record<string, unknown>[]; batchNumber: number };
  onComplete: { totalRows: number; errorRows: number; durationMs: number };
  onError: { line: number; message: string; raw: string };
};

export type Listener<T> = (payload: T) => void;

export class CsvImport {
  private config: Required<Omit<CsvImportConfig, "schema">> & { schema?: CsvImportConfig["schema"] };
  private listeners: Map<string, Listener<unknown>[]> = new Map();

  constructor(config: CsvImportConfig = {}) {
    this.config = {
      delimiter: config.delimiter ?? ",",
      hasHeader: config.hasHeader ?? true,
      encoding: config.encoding ?? "utf-8",
      batchSize: config.batchSize ?? 100,
      skipEmptyRows: config.skipEmptyRows ?? true,
      schema: config.schema,
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

  private isEmptyRow(row: Record<string, unknown>): boolean {
    return Object.values(row).every((v) => v === null || v === undefined || v === "");
  }

  private coerceRow(
    row: Record<string, unknown>
  ): Record<string, unknown> {
    if (!this.config.schema) return row;
    const result: Record<string, unknown> = { ...row };
    for (const [field, type] of Object.entries(this.config.schema)) {
      if (!(field in result)) continue;
      const raw = result[field];
      switch (type) {
        case "number":
          result[field] = raw === "" || raw === null ? null : Number(raw);
          break;
        case "boolean":
          result[field] =
            raw === "true" || raw === "1" || raw === true ? true : false;
          break;
        case "date":
          result[field] = raw === "" || raw === null ? null : new Date(raw as string);
          break;
        case "string":
        default:
          result[field] = raw === null ? null : String(raw);
          break;
      }
    }
    return result;
  }

  async parseBuffer(buffer: Buffer): Promise<Record<string, unknown>[]> {
    return new Promise((resolve, reject) => {
      const rows: Record<string, unknown>[] = [];

      parse(
        buffer,
        {
          columns: this.config.hasHeader,
          delimiter: this.config.delimiter,
          encoding: this.config.encoding,
          skip_empty_lines: this.config.skipEmptyRows,
          cast: false,
          trim: true,
        },
        (err, records: Record<string, unknown>[]) => {
          if (err) {
            reject(err);
            return;
          }

          let index = 0;
          for (const record of records) {
            if (this.config.skipEmptyRows && this.isEmptyRow(record)) continue;
            const coerced = this.coerceRow(record);
            rows.push(coerced);
            this.emit("onRow", { row: coerced, index });
            index++;
          }

          resolve(rows);
        }
      );
    });
  }

  async parseStream(
    stream: NodeJS.ReadableStream | Readable
  ): Promise<ParseStats> {
    const startedAt = Date.now();
    let totalRows = 0;
    let errorRows = 0;
    let batchNumber = 0;
    let batch: Record<string, unknown>[] = [];

    return new Promise((resolve, reject) => {
      const parser = parse({
        columns: this.config.hasHeader,
        delimiter: this.config.delimiter,
        encoding: this.config.encoding,
        skip_empty_lines: this.config.skipEmptyRows,
        cast: false,
        trim: true,
      });

      parser.on("readable", () => {
        let record: Record<string, unknown>;
        while ((record = parser.read() as Record<string, unknown>) !== null) {
          if (this.config.skipEmptyRows && this.isEmptyRow(record)) continue;

          try {
            const coerced = this.coerceRow(record);
            totalRows++;
            this.emit("onRow", { row: coerced, index: totalRows - 1 });
            batch.push(coerced);

            if (batch.length >= this.config.batchSize) {
              batchNumber++;
              this.emit("onBatch", { rows: [...batch], batchNumber });
              batch = [];
            }
          } catch (err) {
            errorRows++;
            this.emit("onError", {
              line: totalRows,
              message: err instanceof Error ? err.message : String(err),
              raw: JSON.stringify(record),
            });
          }
        }
      });

      parser.on("error", (err) => {
        reject(err);
      });

      parser.on("end", () => {
        if (batch.length > 0) {
          batchNumber++;
          this.emit("onBatch", { rows: [...batch], batchNumber });
        }

        const durationMs = Date.now() - startedAt;
        this.emit("onComplete", { totalRows, errorRows, durationMs });
        resolve({ totalRows, validRows: totalRows - errorRows, errorRows, durationMs });
      });

      (stream as Readable).pipe(parser);
    });
  }

  validate(rows: Record<string, unknown>[]): ValidationResult {
    const valid: Record<string, unknown>[] = [];
    const errors: Array<{ row: number; field: string; message: string }> = [];

    if (!this.config.schema) {
      return { valid: rows, errors: [] };
    }

    rows.forEach((row, rowIndex) => {
      let rowValid = true;

      for (const [field, type] of Object.entries(this.config.schema!)) {
        const value = row[field];

        if (value === null || value === undefined || value === "") continue;

        switch (type) {
          case "number":
            if (isNaN(Number(value))) {
              errors.push({ row: rowIndex, field, message: `Expected number, got "${value}"` });
              rowValid = false;
            }
            break;
          case "boolean":
            if (!["true", "false", "1", "0", true, false].includes(value as string | boolean)) {
              errors.push({ row: rowIndex, field, message: `Expected boolean, got "${value}"` });
              rowValid = false;
            }
            break;
          case "date": {
            const d = new Date(value as string);
            if (isNaN(d.getTime())) {
              errors.push({ row: rowIndex, field, message: `Expected date, got "${value}"` });
              rowValid = false;
            }
            break;
          }
        }
      }

      if (rowValid) valid.push(row);
    });

    return { valid, errors };
  }

  async getHeaders(buffer: Buffer): Promise<string[]> {
    return new Promise((resolve, reject) => {
      parse(
        buffer,
        {
          columns: false,
          delimiter: this.config.delimiter,
          encoding: this.config.encoding,
          to: 1,
          trim: true,
        },
        (err, records: string[][]) => {
          if (err) {
            reject(err);
            return;
          }
          if (!records || records.length === 0) {
            resolve([]);
            return;
          }
          resolve(records[0]);
        }
      );
    });
  }
}
