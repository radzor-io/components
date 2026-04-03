// @radzor/csv-export — CSV generation and parsing

import { writeFileSync } from "fs";

// ---- types ----

export interface CsvConfig {
  delimiter?: string;
  includeHeaders?: boolean;
  quoteAll?: boolean;
}

type EventMap = {
  onGenerated: { rows: number; size: number };
  onError: { code: string; message: string };
};

// ---- implementation ----

export class CsvExport {
  private delimiter: string;
  private includeHeaders: boolean;
  private quoteAll: boolean;
  private listeners: { [K in keyof EventMap]?: Array<(payload: EventMap[K]) => void> } = {};

  constructor(config: CsvConfig = {}) {
    this.delimiter = config.delimiter ?? ",";
    this.includeHeaders = config.includeHeaders ?? true;
    this.quoteAll = config.quoteAll ?? false;
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

  generate(data: Record<string, unknown>[]): string {
    try {
      if (data.length === 0) return "";

      const headers = Object.keys(data[0]);
      const lines: string[] = [];

      if (this.includeHeaders) {
        lines.push(headers.map((h) => this.escapeField(h)).join(this.delimiter));
      }

      for (const row of data) {
        const values = headers.map((h) => this.escapeField(String(row[h] ?? "")));
        lines.push(values.join(this.delimiter));
      }

      const csv = lines.join("\n");
      this.emit("onGenerated", { rows: data.length, size: csv.length });
      return csv;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.emit("onError", { code: "GENERATE_ERROR", message });
      throw err;
    }
  }

  generateFromArrays(headers: string[], rows: unknown[][]): string {
    try {
      const lines: string[] = [];

      if (this.includeHeaders) {
        lines.push(headers.map((h) => this.escapeField(h)).join(this.delimiter));
      }

      for (const row of rows) {
        const values = row.map((v) => this.escapeField(String(v ?? "")));
        lines.push(values.join(this.delimiter));
      }

      const csv = lines.join("\n");
      this.emit("onGenerated", { rows: rows.length, size: csv.length });
      return csv;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.emit("onError", { code: "GENERATE_ERROR", message });
      throw err;
    }
  }

  parse(csv: string): Record<string, string>[] {
    try {
      const lines = this.parseLines(csv);
      if (lines.length === 0) return [];

      const headers = lines[0];
      const result: Record<string, string>[] = [];

      for (let i = 1; i < lines.length; i++) {
        const row: Record<string, string> = {};
        for (let j = 0; j < headers.length; j++) {
          row[headers[j]] = lines[i][j] ?? "";
        }
        result.push(row);
      }

      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.emit("onError", { code: "PARSE_ERROR", message });
      throw err;
    }
  }

  toFile(filePath: string, data: Record<string, unknown>[]): void {
    const csv = this.generate(data);
    writeFileSync(filePath, csv, "utf-8");
  }

  private escapeField(value: string): string {
    const needsQuoting = this.quoteAll || value.includes(this.delimiter) || value.includes('"') || value.includes("\n");
    if (needsQuoting) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }

  private parseLines(csv: string): string[][] {
    const result: string[][] = [];
    let current: string[] = [];
    let field = "";
    let inQuotes = false;

    for (let i = 0; i < csv.length; i++) {
      const char = csv[i];

      if (inQuotes) {
        if (char === '"') {
          if (csv[i + 1] === '"') {
            field += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          field += char;
        }
      } else {
        if (char === '"') {
          inQuotes = true;
        } else if (char === this.delimiter) {
          current.push(field);
          field = "";
        } else if (char === "\n" || (char === "\r" && csv[i + 1] === "\n")) {
          current.push(field);
          result.push(current);
          current = [];
          field = "";
          if (char === "\r") i++;
        } else {
          field += char;
        }
      }
    }

    current.push(field);
    if (current.some((f) => f !== "")) result.push(current);

    return result;
  }
}
