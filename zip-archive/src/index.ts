// @radzor/zip-archive — Pure TypeScript ZIP reader/writer (no dependencies)

import * as zlib from "zlib";

export type CompressionMethod = "deflate" | "store";

export interface ZipArchiveConfig {
  compression?: CompressionMethod;
  level?: number;
}

export interface FileEntry {
  name: string;
  size: number;
  compressedSize: number;
  isDirectory: boolean;
}

export interface ZipFileInput {
  name: string;
  content: Buffer | string;
}

export type EventMap = {
  onFileAdded: { name: string; size: number };
  onArchived: { fileCount: number; totalSize: number };
  onExtracted: { name: string; size: number };
  onError: { code: string; message: string };
};

// --- CRC32 implementation (polynomial 0xEDB88320) ---

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC32_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// --- DOS date/time helpers ---

function dosDateTime(): { date: number; time: number } {
  const now = new Date();
  const time =
    (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
  const date =
    ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  return { date, time };
}

// --- Low-level buffer write helpers ---

function writeUInt16LE(buf: Buffer, offset: number, value: number): void {
  buf.writeUInt16LE(value >>> 0, offset);
}

function writeUInt32LE(buf: Buffer, offset: number, value: number): void {
  buf.writeUInt32LE(value >>> 0, offset);
}

function readUInt16LE(buf: Buffer, offset: number): number {
  return buf.readUInt16LE(offset);
}

function readUInt32LE(buf: Buffer, offset: number): number {
  return buf.readUInt32LE(offset);
}

// --- ZIP format constants ---

const SIG_LOCAL_FILE = 0x04034b50;
const SIG_CENTRAL_DIR = 0x02014b50;
const SIG_EOCD = 0x06054b50;
const METHOD_STORE = 0;
const METHOD_DEFLATE = 8;

// --- Local file header builder ---

function buildLocalFileHeader(
  name: Buffer,
  crc: number,
  compressedSize: number,
  uncompressedSize: number,
  method: number,
  dosDate: number,
  dosTime: number
): Buffer {
  const header = Buffer.alloc(30 + name.length);
  writeUInt32LE(header, 0, SIG_LOCAL_FILE);
  writeUInt16LE(header, 4, 20);        // version needed
  writeUInt16LE(header, 6, 0);         // flags
  writeUInt16LE(header, 8, method);    // compression method
  writeUInt16LE(header, 10, dosTime);
  writeUInt16LE(header, 12, dosDate);
  writeUInt32LE(header, 14, crc);
  writeUInt32LE(header, 18, compressedSize);
  writeUInt32LE(header, 22, uncompressedSize);
  writeUInt16LE(header, 26, name.length);
  writeUInt16LE(header, 28, 0);        // extra field length
  name.copy(header, 30);
  return header;
}

// --- Central directory entry builder ---

function buildCentralDirEntry(
  name: Buffer,
  crc: number,
  compressedSize: number,
  uncompressedSize: number,
  method: number,
  dosDate: number,
  dosTime: number,
  localHeaderOffset: number
): Buffer {
  const entry = Buffer.alloc(46 + name.length);
  writeUInt32LE(entry, 0, SIG_CENTRAL_DIR);
  writeUInt16LE(entry, 4, 20);                 // version made by
  writeUInt16LE(entry, 6, 20);                 // version needed
  writeUInt16LE(entry, 8, 0);                  // flags
  writeUInt16LE(entry, 10, method);
  writeUInt16LE(entry, 12, dosTime);
  writeUInt16LE(entry, 14, dosDate);
  writeUInt32LE(entry, 16, crc);
  writeUInt32LE(entry, 20, compressedSize);
  writeUInt32LE(entry, 24, uncompressedSize);
  writeUInt16LE(entry, 28, name.length);
  writeUInt16LE(entry, 30, 0);                 // extra field length
  writeUInt16LE(entry, 32, 0);                 // comment length
  writeUInt16LE(entry, 34, 0);                 // disk number start
  writeUInt16LE(entry, 36, 0);                 // internal attributes
  writeUInt32LE(entry, 38, 0);                 // external attributes
  writeUInt32LE(entry, 42, localHeaderOffset);
  name.copy(entry, 46);
  return entry;
}

// --- End of central directory record ---

function buildEOCD(
  entryCount: number,
  centralDirSize: number,
  centralDirOffset: number
): Buffer {
  const eocd = Buffer.alloc(22);
  writeUInt32LE(eocd, 0, SIG_EOCD);
  writeUInt16LE(eocd, 4, 0);                  // disk number
  writeUInt16LE(eocd, 6, 0);                  // disk with start of central dir
  writeUInt16LE(eocd, 8, entryCount);
  writeUInt16LE(eocd, 10, entryCount);
  writeUInt32LE(eocd, 12, centralDirSize);
  writeUInt32LE(eocd, 16, centralDirOffset);
  writeUInt16LE(eocd, 20, 0);                 // comment length
  return eocd;
}

// --- Main class ---

export class ZipArchive {
  private config: Required<ZipArchiveConfig>;
  private listeners: Map<string, Function[]> = new Map();

  constructor(config: ZipArchiveConfig = {}) {
    this.config = {
      compression: config.compression ?? "deflate",
      level: config.level ?? 6,
    };
  }

  on<K extends keyof EventMap>(event: K, handler: (payload: EventMap[K]) => void): void {
    const handlers = this.listeners.get(event) ?? [];
    handlers.push(handler as Function);
    this.listeners.set(event, handlers);
  }

  off<K extends keyof EventMap>(event: K, handler: (payload: EventMap[K]) => void): void {
    const handlers = this.listeners.get(event) ?? [];
    this.listeners.set(event, handlers.filter((h) => h !== handler));
  }

  private emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
    for (const handler of this.listeners.get(event) ?? []) handler(payload);
  }

  private compress(data: Buffer): Buffer {
    if (this.config.compression === "store") return data;
    return zlib.deflateRawSync(data, { level: this.config.level });
  }

  private toBuffer(content: Buffer | string): Buffer {
    return typeof content === "string" ? Buffer.from(content, "utf-8") : content;
  }

  async create(files: ZipFileInput[]): Promise<Buffer> {
    const parts: Buffer[] = [];
    const centralDirEntries: Buffer[] = [];
    let offset = 0;
    let totalSize = 0;
    const { date: dosDate, time: dosTime } = dosDateTime();
    const method = this.config.compression === "store" ? METHOD_STORE : METHOD_DEFLATE;

    for (const file of files) {
      const raw = this.toBuffer(file.content);
      const compressed = this.compress(raw);
      const crc = crc32(raw);
      const nameBuf = Buffer.from(file.name, "utf-8");

      const localHeader = buildLocalFileHeader(
        nameBuf,
        crc,
        compressed.length,
        raw.length,
        method,
        dosDate,
        dosTime
      );

      centralDirEntries.push(
        buildCentralDirEntry(
          nameBuf,
          crc,
          compressed.length,
          raw.length,
          method,
          dosDate,
          dosTime,
          offset
        )
      );

      parts.push(localHeader, compressed);
      offset += localHeader.length + compressed.length;
      totalSize += raw.length;

      this.emit("onFileAdded", { name: file.name, size: raw.length });
    }

    const centralDirBuf = Buffer.concat(centralDirEntries);
    const eocd = buildEOCD(files.length, centralDirBuf.length, offset);

    const archive = Buffer.concat([...parts, centralDirBuf, eocd]);
    this.emit("onArchived", { fileCount: files.length, totalSize });
    return archive;
  }

  async list(archive: Buffer | string): Promise<FileEntry[]> {
    const buf = this.toBuffer(archive);
    const entries: FileEntry[] = [];

    // Find EOCD by scanning backwards
    const eocdOffset = this.findEOCD(buf);
    if (eocdOffset < 0) {
      const err = { code: "INVALID_ZIP", message: "Cannot find End of Central Directory record" };
      this.emit("onError", err);
      throw new Error(err.message);
    }

    const entryCount = readUInt16LE(buf, eocdOffset + 8);
    const centralDirOffset = readUInt32LE(buf, eocdOffset + 16);

    let pos = centralDirOffset;
    for (let i = 0; i < entryCount; i++) {
      if (readUInt32LE(buf, pos) !== SIG_CENTRAL_DIR) break;

      const compressedSize = readUInt32LE(buf, pos + 20);
      const uncompressedSize = readUInt32LE(buf, pos + 24);
      const nameLen = readUInt16LE(buf, pos + 28);
      const extraLen = readUInt16LE(buf, pos + 30);
      const commentLen = readUInt16LE(buf, pos + 32);
      const name = buf.subarray(pos + 46, pos + 46 + nameLen).toString("utf-8");

      entries.push({
        name,
        size: uncompressedSize,
        compressedSize,
        isDirectory: name.endsWith("/"),
      });

      pos += 46 + nameLen + extraLen + commentLen;
    }

    return entries;
  }

  async extract(
    archive: Buffer | string,
    _outputDir?: string
  ): Promise<Map<string, Buffer>> {
    const buf = this.toBuffer(archive);
    const result = new Map<string, Buffer>();

    const eocdOffset = this.findEOCD(buf);
    if (eocdOffset < 0) {
      const err = { code: "INVALID_ZIP", message: "Cannot find End of Central Directory record" };
      this.emit("onError", err);
      throw new Error(err.message);
    }

    const entryCount = readUInt16LE(buf, eocdOffset + 8);
    const centralDirOffset = readUInt32LE(buf, eocdOffset + 16);

    let pos = centralDirOffset;
    for (let i = 0; i < entryCount; i++) {
      if (readUInt32LE(buf, pos) !== SIG_CENTRAL_DIR) break;

      const method = readUInt16LE(buf, pos + 10);
      const compressedSize = readUInt32LE(buf, pos + 20);
      const uncompressedSize = readUInt32LE(buf, pos + 24);
      const nameLen = readUInt16LE(buf, pos + 28);
      const extraLen = readUInt16LE(buf, pos + 30);
      const commentLen = readUInt16LE(buf, pos + 32);
      const localHeaderOffset = readUInt32LE(buf, pos + 42);
      const name = buf.subarray(pos + 46, pos + 46 + nameLen).toString("utf-8");

      pos += 46 + nameLen + extraLen + commentLen;

      if (name.endsWith("/")) continue; // skip directories

      // Read data from local file header
      const localNameLen = readUInt16LE(buf, localHeaderOffset + 26);
      const localExtraLen = readUInt16LE(buf, localHeaderOffset + 28);
      const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
      const compressedData = buf.subarray(dataStart, dataStart + compressedSize);

      let data: Buffer;
      if (method === METHOD_DEFLATE) {
        data = zlib.inflateRawSync(compressedData);
      } else {
        data = Buffer.from(compressedData);
      }

      result.set(name, data);
      this.emit("onExtracted", { name, size: uncompressedSize });
    }

    return result;
  }

  async addFile(
    archive: Buffer,
    name: string,
    content: Buffer | string
  ): Promise<Buffer> {
    // Extract existing files, add new one, re-create
    const existingFiles = await this.extract(archive);
    const inputs: ZipFileInput[] = [];

    for (const [entryName, entryData] of existingFiles) {
      inputs.push({ name: entryName, content: entryData });
    }
    inputs.push({ name, content });

    return this.create(inputs);
  }

  private findEOCD(buf: Buffer): number {
    // Scan backwards from end (comment could be up to 65535 bytes)
    const minOffset = Math.max(0, buf.length - 65557);
    for (let i = buf.length - 22; i >= minOffset; i--) {
      if (readUInt32LE(buf, i) === SIG_EOCD) {
        return i;
      }
    }
    return -1;
  }
}
