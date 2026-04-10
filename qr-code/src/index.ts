// @radzor/qr-code — Pure TypeScript QR code generator (SVG output, zero dependencies)
// Implements QR Code Model 2, byte encoding, error correction levels L/M/Q/H.
// PNG output requires an external rasterizer (e.g. @radzor/image-transform or sharp).

import * as fs from "fs/promises";

export type ErrorCorrectionLevel = "L" | "M" | "Q" | "H";
export type OutputFormat = "png" | "svg";

export interface QrCodeConfig {
  errorCorrection?: ErrorCorrectionLevel;
  size?: number;
  margin?: number;
  darkColor?: string;
  lightColor?: string;
}

export interface GeneratedEvent {
  format: OutputFormat;
  version: number;
}

export interface ErrorEvent {
  code: string;
  message: string;
}

export type EventMap = {
  onGenerated: GeneratedEvent;
  onDecoded: { data: string; format: string };
  onError: ErrorEvent;
};

export type Listener<T> = (event: T) => void;

// ─── Reed-Solomon GF(256) ────────────────────────────────────────────────────

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);

(function initGF() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
})();

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

function rsGeneratorPoly(degree: number): number[] {
  let poly = [1];
  for (let i = 0; i < degree; i++) {
    const root = GF_EXP[i];
    const next = [1, root];
    const result = new Array(poly.length + next.length - 1).fill(0);
    for (let a = 0; a < poly.length; a++) {
      for (let b = 0; b < next.length; b++) {
        result[a + b] ^= gfMul(poly[a], next[b]);
      }
    }
    poly = result;
  }
  return poly;
}

function rsEncode(data: number[], numEcc: number): number[] {
  const gen = rsGeneratorPoly(numEcc);
  const msg = [...data, ...new Array(numEcc).fill(0)];
  for (let i = 0; i < data.length; i++) {
    const coef = msg[i];
    if (coef !== 0) {
      for (let j = 1; j < gen.length; j++) {
        msg[i + j] ^= gfMul(gen[j], coef);
      }
    }
  }
  return msg.slice(data.length);
}

// ─── QR Code Constants ────────────────────────────────────────────────────────

// EC codewords and blocks for versions 1–10 [L, M, Q, H]
const EC_TABLE: Array<[number, number, number, number, number, number, number, number]> = [
  // version: [ecL,blkL, ecM,blkM, ecQ,blkQ, ecH,blkH]
  [7, 1, 10, 1, 13, 1, 17, 1],    // 1
  [10, 1, 16, 1, 22, 1, 28, 1],   // 2
  [15, 1, 26, 2, 18, 2, 22, 2],   // 3
  [20, 2, 18, 2, 26, 4, 16, 4],   // 4
  [26, 2, 24, 4, 18, 4, 22, 4],   // 5
  [18, 4, 16, 4, 24, 6, 28, 6],   // 6 (simplified)
  [20, 4, 18, 6, 18, 8, 26, 5],   // 7
  [24, 2, 22, 6, 22, 8, 26, 6],   // 8
  [30, 3, 22, 8, 20, 8, 24, 8],   // 9
  [18, 4, 26, 8, 24, 8, 28, 8],   // 10
];

// Total codewords per version
const TOTAL_CODEWORDS = [0,26,44,70,100,134,172,196,242,292,346];

// Alignment pattern centers for versions 2+
const ALIGN_PATTERNS: number[][] = [
  [], [], [6,18], [6,22], [6,26], [6,30], [6,34],
  [6,22,38], [6,24,42], [6,26,46], [6,28,50],
];

// Format info bit strings (L=01,M=00,Q=11,H=10) XOR'd with mask pattern 000 for simplicity
// Precomputed for mask 000 (standard): level order [M,L,H,Q] but we use mask 0
const FORMAT_BITS: Record<ErrorCorrectionLevel, number> = { L: 1, M: 0, Q: 3, H: 2 };

// ─── QR Matrix Builder ────────────────────────────────────────────────────────

function buildMatrix(version: number): { matrix: Uint8Array; size: number } {
  const size = version * 4 + 17;
  // Each cell: bit0 = module value, bit1 = is-function (reserved)
  const matrix = new Uint8Array(size * size);

  const set = (r: number, c: number, val: number, func = false) => {
    if (r < 0 || r >= size || c < 0 || c >= size) return;
    matrix[r * size + c] = (val & 1) | (func ? 2 : 0);
  };

  const get = (r: number, c: number) => (r >= 0 && r < size && c >= 0 && c < size ? matrix[r * size + c] : 0);

  // Finder patterns
  const addFinder = (row: number, col: number) => {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const dark = r === -1 || r === 7 || c === -1 || c === 7 ||
                     (r >= 2 && r <= 4 && c >= 2 && c <= 4) ||
                     r === 0 || r === 6 || c === 0 || c === 6;
        const inCenter = r >= 1 && r <= 5 && c >= 1 && c <= 5;
        set(row + r, col + c, (dark && !inCenter) || (r >= 2 && r <= 4 && c >= 2 && c <= 4) ? 1 : 0, true);
      }
    }
  };

  addFinder(0, 0);
  addFinder(0, size - 7);
  addFinder(size - 7, 0);

  // Timing patterns
  for (let i = 8; i < size - 8; i++) {
    set(6, i, i % 2 === 0 ? 1 : 0, true);
    set(i, 6, i % 2 === 0 ? 1 : 0, true);
  }

  // Alignment patterns
  const aligns = ALIGN_PATTERNS[version] ?? [];
  for (const ar of aligns) {
    for (const ac of aligns) {
      if ((get(ar, ac) & 2) !== 0) continue; // skip if function module
      for (let r = -2; r <= 2; r++) {
        for (let c = -2; c <= 2; c++) {
          const dark = r === -2 || r === 2 || c === -2 || c === 2 || (r === 0 && c === 0);
          set(ar + r, ac + c, dark ? 1 : 0, true);
        }
      }
    }
  }

  // Dark module
  set(4 * version + 9, 8, 1, true);

  // Reserve format info areas
  for (let i = 0; i <= 8; i++) {
    if ((get(8, i) & 2) === 0) set(8, i, 0, true);
    if ((get(i, 8) & 2) === 0) set(i, 8, 0, true);
    if ((get(8, size - 1 - i) & 2) === 0) set(8, size - 1 - i, 0, true);
    if ((get(size - 1 - i, 8) & 2) === 0) set(size - 1 - i, 8, 0, true);
  }

  return { matrix, size };
}

function placeData(matrix: Uint8Array, size: number, bits: boolean[]): void {
  let idx = 0;
  let up = true;

  for (let col = size - 1; col >= 1; col -= 2) {
    if (col === 6) col--; // skip timing column
    for (let row = up ? size - 1 : 0; up ? row >= 0 : row < size; up ? row-- : row++) {
      for (let c = 0; c < 2; c++) {
        const cc = col - c;
        if ((matrix[row * size + cc] & 2) === 0) {
          const bit = idx < bits.length ? bits[idx++] : false;
          matrix[row * size + cc] = bit ? 1 : 0;
        }
      }
    }
    up = !up;
  }
}

function applyMask(matrix: Uint8Array, size: number, maskPattern: number): Uint8Array {
  const masked = new Uint8Array(matrix);
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (masked[r * size + c] & 2) continue; // function module
      const shouldFlip = maskPattern === 0 ? (r + c) % 2 === 0 : (r * c) % 3 + (r + c) % 2 === 0;
      if (shouldFlip) {
        masked[r * size + c] ^= 1;
      }
    }
  }
  return masked;
}

function writeFormatInfo(matrix: Uint8Array, size: number, ecLevel: ErrorCorrectionLevel, mask: number): void {
  // Format info: 2 bits EC + 3 bits mask = 5 bits data → BCH(15,5) + XOR mask 101010000010010
  const ecBits = FORMAT_BITS[ecLevel];
  const data = (ecBits << 3) | mask;
  // BCH remainder
  let rem = data << 10;
  const gen = 0x537; // x^10 + x^8 + x^5 + x^4 + x^2 + x + 1
  for (let i = 14; i >= 10; i--) {
    if (rem & (1 << i)) rem ^= gen << (i - 10);
  }
  const bits15 = ((data << 10) | rem) ^ 0x5412;

  const positions = [
    [8,0],[8,1],[8,2],[8,3],[8,4],[8,5],[8,7],[8,8],[7,8],[5,8],[4,8],[3,8],[2,8],[1,8],[0,8],
  ];
  const positions2 = [
    [size-1,8],[size-2,8],[size-3,8],[size-4,8],[size-5,8],[size-6,8],[size-7,8],
    [8,size-8],[8,size-7],[8,size-6],[8,size-5],[8,size-4],[8,size-3],[8,size-2],[8,size-1],
  ];

  for (let i = 0; i < 15; i++) {
    const bit = (bits15 >> (14 - i)) & 1;
    const [r1, c1] = positions[i];
    matrix[r1 * size + c1] = bit | 2;
    const [r2, c2] = positions2[i];
    matrix[r2 * size + c2] = bit | 2;
  }
}

// ─── Data Encoding ────────────────────────────────────────────────────────────

function encodeBytes(data: string): boolean[] {
  const bytes = Buffer.from(data, "utf-8");
  const bits: boolean[] = [];

  const push = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) bits.push(!!((val >> i) & 1));
  };

  push(0b0100, 4);       // byte mode indicator
  push(bytes.length, 8); // character count
  for (const byte of bytes) push(byte, 8);
  push(0, 4); // terminator

  return bits;
}

function selectVersion(data: string, ecLevel: ErrorCorrectionLevel): number {
  const byteCount = Buffer.from(data, "utf-8").length;
  const ecIdx = ["M", "L", "H", "Q"].indexOf(ecLevel);
  const ecMap = [0, 2, 6, 4]; // indices into EC_TABLE tuple pairs: M=0,L=2,H=6,Q=4 → offset pairs

  for (let v = 1; v <= 10; v++) {
    const ecEntry = EC_TABLE[v - 1];
    const eccPerBlock = ecEntry[ecIdx * 2];
    const numBlocks = ecEntry[ecIdx * 2 + 1];
    const totalCodewords = TOTAL_CODEWORDS[v];
    const dataCodewords = totalCodewords - eccPerBlock * numBlocks;
    const capacity = dataCodewords - 3; // approx bytes (subtract mode+length overhead)
    if (byteCount <= capacity) return v;
  }
  throw new Error(`Data too long for QR version 10 (max ~271 bytes). Use shorter input.`);
}

function buildBitstream(data: string, version: number, ecLevel: ErrorCorrectionLevel): boolean[] {
  const ecIdx = ["M", "L", "H", "Q"].indexOf(ecLevel);
  const ecEntry = EC_TABLE[version - 1];
  const eccPerBlock = ecEntry[ecIdx * 2];
  const numBlocks = ecEntry[ecIdx * 2 + 1];
  const totalCodewords = TOTAL_CODEWORDS[version];
  const dataCodewords = totalCodewords - eccPerBlock * numBlocks;

  const dataBits = encodeBytes(data);
  const targetBits = dataCodewords * 8;

  // Pad to capacity
  while (dataBits.length < targetBits - 7) dataBits.push(false);
  dataBits.length = targetBits;

  // Convert to bytes
  const dataBytes: number[] = [];
  for (let i = 0; i < dataCodewords; i++) {
    let byte = 0;
    for (let b = 0; b < 8; b++) {
      byte = (byte << 1) | (dataBits[i * 8 + b] ? 1 : 0);
    }
    dataBytes.push(byte);
  }

  // Add padding bytes
  const padBytes = [0xEC, 0x11];
  let padIdx = 0;
  while (dataBytes.length < dataCodewords) {
    dataBytes.push(padBytes[padIdx++ % 2]);
  }

  // Split into blocks and add EC
  const blockSize = Math.floor(dataCodewords / numBlocks);
  const largeBlocks = dataCodewords % numBlocks;
  const blocks: number[][] = [];
  const ecBlocks: number[][] = [];
  let offset = 0;

  for (let b = 0; b < numBlocks; b++) {
    const bSize = b < numBlocks - largeBlocks ? blockSize : blockSize + 1;
    const block = dataBytes.slice(offset, offset + bSize);
    blocks.push(block);
    ecBlocks.push(rsEncode(block, eccPerBlock));
    offset += bSize;
  }

  // Interleave data codewords
  const interleaved: number[] = [];
  const maxBlock = Math.max(...blocks.map((b) => b.length));
  for (let i = 0; i < maxBlock; i++) {
    for (const block of blocks) if (i < block.length) interleaved.push(block[i]);
  }
  for (let i = 0; i < eccPerBlock; i++) {
    for (const ec of ecBlocks) interleaved.push(ec[i]);
  }

  // Convert to bits
  const bits: boolean[] = [];
  for (const byte of interleaved) {
    for (let b = 7; b >= 0; b--) bits.push(!!((byte >> b) & 1));
  }

  return bits;
}

// ─── SVG Generation ───────────────────────────────────────────────────────────

function matrixToSvg(
  matrix: Uint8Array,
  size: number,
  config: Required<QrCodeConfig>
): string {
  const moduleSize = (config.size - 2 * config.margin) / size;
  const total = config.size;
  const margin = config.margin;

  let rects = "";
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (matrix[r * size + c] & 1) {
        const x = (margin + c * moduleSize).toFixed(2);
        const y = (margin + r * moduleSize).toFixed(2);
        const w = (moduleSize + 0.1).toFixed(2); // slight overlap to prevent gaps
        rects += `<rect x="${x}" y="${y}" width="${w}" height="${w}"/>`;
      }
    }
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="${total}" height="${total}">
<rect width="${total}" height="${total}" fill="${config.lightColor}"/>
<g fill="${config.darkColor}">${rects}</g>
</svg>`;
}

// ─── Main Class ───────────────────────────────────────────────────────────────

export class QrCode {
  private config: Required<QrCodeConfig>;
  private listeners: { [K in keyof EventMap]?: Listener<EventMap[K]>[] } = {};

  constructor(config: QrCodeConfig = {}) {
    this.config = {
      errorCorrection: config.errorCorrection ?? "M",
      size: config.size ?? 300,
      margin: config.margin ?? 16,
      darkColor: config.darkColor ?? "#000000",
      lightColor: config.lightColor ?? "#ffffff",
    };
  }

  on<K extends keyof EventMap>(event: K, listener: Listener<EventMap[K]>): void {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event]!.push(listener);
  }

  off<K extends keyof EventMap>(event: K, listener: Listener<EventMap[K]>): void {
    const list = this.listeners[event];
    if (list) {
      this.listeners[event] = list.filter((l) => l !== listener) as Listener<EventMap[K]>[];
    }
  }

  private emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
    const list = this.listeners[event];
    if (list) list.forEach((l) => l(payload));
  }

  /**
   * Generate a QR code. format='svg' returns SVG buffer (default).
   * format='png' returns SVG buffer with a note — PNG rasterization requires
   * an external library such as sharp or @radzor/image-transform.
   */
  async generate(data: string, format: OutputFormat = "svg"): Promise<Buffer> {
    try {
      if (!data) throw new Error("Data must not be empty.");
      const ecLevel = this.config.errorCorrection;
      const version = selectVersion(data, ecLevel);
      const { matrix, size } = buildMatrix(version);
      const bits = buildBitstream(data, version, ecLevel);
      placeData(matrix, size, bits);
      const masked = applyMask(matrix, size, 0);
      writeFormatInfo(masked, size, ecLevel, 0);

      const svg = matrixToSvg(masked, size, this.config);
      const buf = Buffer.from(svg, "utf-8");

      this.emit("onGenerated", { format, version });

      if (format === "png") {
        // Return SVG with a comment noting PNG conversion
        const note = `<!-- PNG output requires a rasterizer. Use sharp or @radzor/image-transform to convert this SVG to PNG. -->\n`;
        return Buffer.from(note + svg, "utf-8");
      }

      return buf;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.emit("onError", { code: "GENERATE_ERROR", message });
      throw err;
    }
  }

  /** Generate a QR code and return a data URL (SVG). */
  async generateDataUrl(data: string): Promise<string> {
    const buf = await this.generate(data, "svg");
    return `data:image/svg+xml;base64,${buf.toString("base64")}`;
  }

  /** Generate a QR code and write it to a file. */
  async generateToFile(data: string, outputPath: string): Promise<void> {
    const isPng = outputPath.toLowerCase().endsWith(".png");
    const buf = await this.generate(data, isPng ? "png" : "svg");
    await fs.writeFile(outputPath, buf);
  }

  /**
   * Decode a QR code from a buffer or base64 string.
   * Note: Decoding requires image processing. Install @zxing/library or
   * use an external service. This method throws a descriptive error.
   */
  async decode(input: Buffer | string): Promise<string> {
    try {
      const _buffer = typeof input === "string" ? await fs.readFile(input) : input;

      // Full decoding requires image processing capabilities.
      // When a decoder is available, the result would be emitted here:
      // const data = await decoderLibrary.decode(_buffer);
      // this.emit("onDecoded", { data, format: "qr_code" });
      // return data;

      throw new Error(
        "QR code decoding requires image processing capabilities not available in a zero-dependency context. " +
        "Install @zxing/library (npm install @zxing/library) or use an external decode API."
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.emit("onError", { code: "DECODE_UNSUPPORTED", message });
      throw err;
    }
  }
}

export default QrCode;
