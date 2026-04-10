// @radzor/database-migrate — Run SQL database migrations with up/down support

import * as fs from "fs";
import * as path from "path";
import * as net from "net";

// ---- types ----

export interface MigrateConfig {
  databaseUrl: string;
  migrationsDir?: string;
  tableName?: string;
}

export interface MigrationFile {
  name: string;
  filePath: string;
  up: () => string;
  down: () => string;
}

export interface MigrationStatus {
  applied: string[];
  pending: string[];
  current: string;
}

export interface MigrateResult {
  applied: string[];
  durationMs: number;
}

export interface RollbackResult {
  rolledBack: string[];
  durationMs: number;
}

export type EventMap = {
  onMigrationComplete: { name: string; direction: string; durationMs: number };
  onMigrationFailed: { name: string; direction: string; error: string };
};

type Listener<T> = (payload: T) => void;

// ---- PostgreSQL wire protocol (simplified) ----

interface PgConnection {
  socket: net.Socket;
  ready: boolean;
}

function parseConnString(url: string): {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
} {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: parseInt(u.port || "5432"),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.slice(1),
  };
}

function buildStartupMessage(user: string, database: string): Buffer {
  const params = Buffer.from(
    `user\0${user}\0database\0${database}\0\0`,
    "utf-8"
  );
  const len = 4 + 4 + params.length;
  const buf = Buffer.alloc(len);
  buf.writeInt32BE(len, 0);
  buf.writeInt32BE(196608, 4); // protocol version 3.0
  params.copy(buf, 8);
  return buf;
}

function buildPasswordMessage(password: string): Buffer {
  const pwBuf = Buffer.from(password + "\0", "utf-8");
  const len = 4 + pwBuf.length;
  const buf = Buffer.alloc(1 + len);
  buf.write("p", 0);
  buf.writeInt32BE(len, 1);
  pwBuf.copy(buf, 5);
  return buf;
}

function buildQueryMessage(sql: string): Buffer {
  const sqlBuf = Buffer.from(sql + "\0", "utf-8");
  const len = 4 + sqlBuf.length;
  const buf = Buffer.alloc(1 + len);
  buf.write("Q", 0);
  buf.writeInt32BE(len, 1);
  sqlBuf.copy(buf, 5);
  return buf;
}

async function pgConnect(
  connStr: string
): Promise<{
  query: (sql: string) => Promise<Array<Record<string, string>>>;
  close: () => void;
}> {
  const cfg = parseConnString(connStr);

  return new Promise((resolve, reject) => {
    const socket = net.createConnection(cfg.port, cfg.host);
    let authenticated = false;
    let responseBuffer = Buffer.alloc(0);
    let currentResolve: ((rows: Array<Record<string, string>>) => void) | null = null;
    let currentReject: ((err: Error) => void) | null = null;
    let columns: string[] = [];
    let rows: Array<Record<string, string>> = [];

    socket.on("connect", () => {
      socket.write(buildStartupMessage(cfg.user, cfg.database));
    });

    socket.on("data", (chunk) => {
      responseBuffer = Buffer.concat([responseBuffer, chunk]);
      processMessages();
    });

    socket.on("error", (err) => {
      if (!authenticated) reject(err);
      else if (currentReject) currentReject(err);
    });

    function processMessages(): void {
      while (responseBuffer.length >= 5) {
        const type = String.fromCharCode(responseBuffer[0]);
        const len = responseBuffer.readInt32BE(1);
        if (responseBuffer.length < 1 + len) break;

        const msgBody = responseBuffer.subarray(5, 1 + len);
        responseBuffer = responseBuffer.subarray(1 + len);

        switch (type) {
          case "R": // Authentication
            handleAuth(msgBody);
            break;
          case "K": // BackendKeyData - ignore
            break;
          case "Z": // ReadyForQuery
            if (!authenticated) {
              authenticated = true;
              resolve({ query, close });
            } else if (currentResolve) {
              const r = currentResolve;
              const savedRows = [...rows];
              currentResolve = null;
              currentReject = null;
              columns = [];
              rows = [];
              r(savedRows);
            }
            break;
          case "T": // RowDescription
            columns = parseRowDescription(msgBody);
            break;
          case "D": // DataRow
            rows.push(parseDataRow(msgBody, columns));
            break;
          case "C": // CommandComplete - ignore
            break;
          case "E": // ErrorResponse
            {
              const errMsg = parseError(msgBody);
              if (!authenticated) reject(new Error(errMsg));
              else if (currentReject) {
                const rej = currentReject;
                currentResolve = null;
                currentReject = null;
                columns = [];
                rows = [];
                rej(new Error(errMsg));
              }
            }
            break;
          case "N": // NoticeResponse - ignore
            break;
          case "S": // ParameterStatus - ignore
            break;
        }
      }
    }

    function handleAuth(body: Buffer): void {
      const authType = body.readInt32BE(0);
      if (authType === 0) return; // AuthOk
      if (authType === 3) {
        // cleartext password
        socket.write(buildPasswordMessage(cfg.password));
      }
      // MD5 and SCRAM would need more complex handling
    }

    function parseRowDescription(body: Buffer): string[] {
      const cols: string[] = [];
      let offset = 2; // skip field count (Int16)
      const fieldCount = body.readInt16BE(0);
      for (let i = 0; i < fieldCount; i++) {
        const nameEnd = body.indexOf(0, offset);
        cols.push(body.subarray(offset, nameEnd).toString("utf-8"));
        offset = nameEnd + 1 + 18; // skip: null + tableOID(4) + colAttr(2) + typeOID(4) + typeLen(2) + typeMod(4) + format(2)
      }
      return cols;
    }

    function parseDataRow(
      body: Buffer,
      cols: string[]
    ): Record<string, string> {
      const row: Record<string, string> = {};
      let offset = 2; // skip field count
      const fieldCount = body.readInt16BE(0);
      for (let i = 0; i < fieldCount; i++) {
        const len = body.readInt32BE(offset);
        offset += 4;
        if (len === -1) {
          row[cols[i] ?? `col${i}`] = "";
        } else {
          row[cols[i] ?? `col${i}`] = body.subarray(offset, offset + len).toString("utf-8");
          offset += len;
        }
      }
      return row;
    }

    function parseError(body: Buffer): string {
      let msg = "PostgreSQL error";
      let offset = 0;
      while (offset < body.length) {
        const fieldType = String.fromCharCode(body[offset]);
        if (fieldType === "\0") break;
        offset++;
        const end = body.indexOf(0, offset);
        const value = body.subarray(offset, end).toString("utf-8");
        if (fieldType === "M") msg = value;
        offset = end + 1;
      }
      return msg;
    }

    function query(sql: string): Promise<Array<Record<string, string>>> {
      return new Promise((res, rej) => {
        currentResolve = res;
        currentReject = rej;
        columns = [];
        rows = [];
        socket.write(buildQueryMessage(sql));
      });
    }

    function close(): void {
      const buf = Buffer.alloc(5);
      buf.write("X", 0);
      buf.writeInt32BE(4, 1);
      socket.write(buf);
      socket.end();
    }
  });
}

// ---- implementation ----

export class DatabaseMigrate {
  private databaseUrl: string;
  private migrationsDir: string;
  private tableName: string;
  private listeners: { [K in keyof EventMap]?: Array<Listener<EventMap[K]>> } = {};

  constructor(config: MigrateConfig) {
    this.databaseUrl = config.databaseUrl;
    this.migrationsDir = config.migrationsDir ?? "./migrations";
    this.tableName = config.tableName ?? "_migrations";
  }

  on<K extends keyof EventMap>(event: K, listener: Listener<EventMap[K]>): void {
    (this.listeners[event] ??= []).push(listener);
  }

  off<K extends keyof EventMap>(event: K, listener: Listener<EventMap[K]>): void {
    const arr = this.listeners[event];
    if (arr) this.listeners[event] = arr.filter((l) => l !== listener) as any;
  }

  private emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
    this.listeners[event]?.forEach((l) => l(payload));
  }

  private async withDb<T>(
    fn: (db: { query: (sql: string) => Promise<Array<Record<string, string>>>; close: () => void }) => Promise<T>
  ): Promise<T> {
    const db = await pgConnect(this.databaseUrl);
    try {
      return await fn(db);
    } finally {
      db.close();
    }
  }

  private async ensureTable(
    db: { query: (sql: string) => Promise<Array<Record<string, string>>> }
  ): Promise<void> {
    await db.query(`
      CREATE TABLE IF NOT EXISTS ${this.tableName} (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        applied_at TIMESTAMP DEFAULT NOW()
      )
    `);
  }

  private loadMigrationFiles(): MigrationFile[] {
    const dir = path.resolve(this.migrationsDir);
    if (!fs.existsSync(dir)) return [];

    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".ts") || f.endsWith(".js")).sort();

    return files.map((filename) => {
      const filePath = path.join(dir, filename);
      const name = filename.replace(/\.(ts|js)$/, "");
      const content = fs.readFileSync(filePath, "utf-8");

      // Parse up() and down() from the file content
      const upMatch = content.match(/(?:export\s+)?function\s+up\s*\(\s*\)\s*(?::\s*string)?\s*\{[\s\S]*?return\s+[`"']([\s\S]*?)[`"']\s*;?\s*\}/);
      const downMatch = content.match(/(?:export\s+)?function\s+down\s*\(\s*\)\s*(?::\s*string)?\s*\{[\s\S]*?return\s+[`"']([\s\S]*?)[`"']\s*;?\s*\}/);

      return {
        name,
        filePath,
        up: () => upMatch?.[1] ?? "",
        down: () => downMatch?.[1] ?? "",
      };
    });
  }

  async migrate(target?: string): Promise<MigrateResult> {
    const start = Date.now();
    const applied: string[] = [];

    await this.withDb(async (db) => {
      await this.ensureTable(db);

      const rows = await db.query(
        `SELECT name FROM ${this.tableName} ORDER BY id`
      );
      const appliedSet = new Set(rows.map((r) => r.name));
      const allFiles = this.loadMigrationFiles();
      const pending = allFiles.filter((f) => !appliedSet.has(f.name));

      for (const migration of pending) {
        if (target && migration.name > target) break;

        const migStart = Date.now();
        try {
          const sql = migration.up();
          if (sql) {
            await db.query("BEGIN");
            await db.query(sql);
            await db.query(
              `INSERT INTO ${this.tableName} (name) VALUES ('${migration.name}')`
            );
            await db.query("COMMIT");
          }

          const dur = Date.now() - migStart;
          applied.push(migration.name);
          this.emit("onMigrationComplete", {
            name: migration.name,
            direction: "up",
            durationMs: dur,
          });
        } catch (err) {
          await db.query("ROLLBACK").catch(() => {});
          const message = err instanceof Error ? err.message : String(err);
          this.emit("onMigrationFailed", {
            name: migration.name,
            direction: "up",
            error: message,
          });
          throw err;
        }
      }
    });

    return { applied, durationMs: Date.now() - start };
  }

  async rollback(steps?: number): Promise<RollbackResult> {
    const start = Date.now();
    const rolledBack: string[] = [];
    const count = steps ?? 1;

    await this.withDb(async (db) => {
      await this.ensureTable(db);

      const rows = await db.query(
        `SELECT name FROM ${this.tableName} ORDER BY id DESC LIMIT ${count}`
      );
      const allFiles = this.loadMigrationFiles();
      const fileMap = new Map(allFiles.map((f) => [f.name, f]));

      for (const row of rows) {
        const migration = fileMap.get(row.name);
        if (!migration) continue;

        const migStart = Date.now();
        try {
          const sql = migration.down();
          if (sql) {
            await db.query("BEGIN");
            await db.query(sql);
            await db.query(
              `DELETE FROM ${this.tableName} WHERE name = '${migration.name}'`
            );
            await db.query("COMMIT");
          }

          const dur = Date.now() - migStart;
          rolledBack.push(migration.name);
          this.emit("onMigrationComplete", {
            name: migration.name,
            direction: "down",
            durationMs: dur,
          });
        } catch (err) {
          await db.query("ROLLBACK").catch(() => {});
          const message = err instanceof Error ? err.message : String(err);
          this.emit("onMigrationFailed", {
            name: migration.name,
            direction: "down",
            error: message,
          });
          throw err;
        }
      }
    });

    return { rolledBack, durationMs: Date.now() - start };
  }

  async getStatus(): Promise<MigrationStatus> {
    return this.withDb(async (db) => {
      await this.ensureTable(db);

      const rows = await db.query(
        `SELECT name FROM ${this.tableName} ORDER BY id`
      );
      const appliedNames = rows.map((r) => r.name);
      const appliedSet = new Set(appliedNames);

      const allFiles = this.loadMigrationFiles();
      const pending = allFiles
        .filter((f) => !appliedSet.has(f.name))
        .map((f) => f.name);

      return {
        applied: appliedNames,
        pending,
        current: appliedNames[appliedNames.length - 1] ?? "",
      };
    });
  }

  async createMigration(name: string): Promise<{ filePath: string; name: string }> {
    const dir = path.resolve(this.migrationsDir);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const timestamp = new Date()
      .toISOString()
      .replace(/[-:T]/g, "")
      .slice(0, 14);
    const fileName = `${timestamp}_${name}.ts`;
    const filePath = path.join(dir, fileName);

    const template = `// Migration: ${name}

export function up(): string {
  return \`
    -- Add your forward migration SQL here
  \`;
}

export function down(): string {
  return \`
    -- Add your rollback migration SQL here
  \`;
}
`;

    fs.writeFileSync(filePath, template, "utf-8");

    return { filePath, name: fileName.replace(/\.ts$/, "") };
  }
}

export default DatabaseMigrate;
