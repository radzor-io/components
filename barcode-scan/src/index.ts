// @radzor/barcode-scan — Zero-dependency SVG barcode generator

export type BarcodeFormat = "code128" | "ean13" | "upca" | "code39";
export type OutputFormat = "svg" | "png";

export interface BarcodeScanConfig {
  format?: BarcodeFormat;
  width?: number;
  height?: number;
  includeText?: boolean;
}

export interface ScanResult {
  data: string;
  format: BarcodeFormat;
  confidence: number;
}

export interface GeneratedEvent {
  data: string;
  format: BarcodeFormat;
  bytes: number;
}

export interface ScannedEvent {
  result: ScanResult;
}

export interface BarcodeError {
  code: string;
  message: string;
}

export type EventMap = {
  onGenerated: GeneratedEvent;
  onScanned: ScannedEvent;
  onError: BarcodeError;
};

export type Listener<T> = (event: T) => void;

// Code128 character encoding table (subset B)
const CODE128B: Record<string, number> = {};
const CODE128B_CHARS =
  " !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~";
for (let i = 0; i < CODE128B_CHARS.length; i++) {
  CODE128B[CODE128B_CHARS[i]] = i + 32;
}

const CODE128_PATTERNS: number[] = [
  // Each entry is an 11-bit pattern (bars+spaces alternating, bar=1)
  0b11011001100, 0b11001101100, 0b11001100110, 0b10010011000, 0b10010001100,
  0b10001001100, 0b10011001000, 0b10011000100, 0b10001100100, 0b11001001000,
  0b11001000100, 0b11000100100, 0b10110011100, 0b10011011100, 0b10011001110,
  0b10111001100, 0b10011101100, 0b10011100110, 0b11001110010, 0b11001011100,
  0b11001001110, 0b11011100100, 0b11001110100, 0b11101101110, 0b11101001100,
  0b11100101100, 0b11100100110, 0b11101100100, 0b11100110100, 0b11100110010,
  0b11011011000, 0b11011000110, 0b11000110110, 0b10100011000, 0b10001011000,
  0b10001000110, 0b10110001000, 0b10001101000, 0b10001100010, 0b11010001000,
  0b11000101000, 0b11000100010, 0b10110111000, 0b10110001110, 0b10001101110,
  0b10111011000, 0b10111000110, 0b10001110110, 0b11101110110, 0b11010001110,
  0b11000101110, 0b11011101000, 0b11011100010, 0b11011101110, 0b11101011000,
  0b11101000110, 0b11100010110, 0b11101101000, 0b11101100010, 0b11100011010,
  0b11101111010, 0b11001000010, 0b11110001010, 0b10100110000, 0b10100001100,
  0b10010110000, 0b10010000110, 0b10000101100, 0b10000100110, 0b10110010000,
  0b10110000100, 0b10011010000, 0b10011000010, 0b10000110100, 0b10000110010,
  0b11000010010, 0b11001010000, 0b11110111010, 0b11000010100, 0b10001111010,
  0b10100111100, 0b10010111100, 0b10010011110, 0b10111100100, 0b10011110100,
  0b10011110010, 0b11110100100, 0b11110010100, 0b11110010010, 0b11011011110,
  0b11011110110, 0b11110110110, 0b10101111000, 0b10100011110, 0b10001011110,
  0b10111101000, 0b10111100010, 0b11110101000, 0b11110100010, 0b10111011110,
  0b10111101110, 0b11101011110, 0b11110101110,
  // Special codes: START_B=104, STOP=106
  0b11010010000, // 103 START_A
  0b11010001000, // 104 START_B
  0b11010011100, // 105 START_C
  0b11000111010, // 106 STOP
];

const START_B = 104;
const STOP = 106;

function patternToBars(pattern: number, bits = 11): boolean[] {
  const bars: boolean[] = [];
  for (let i = bits - 1; i >= 0; i--) {
    bars.push(((pattern >> i) & 1) === 1);
  }
  return bars;
}

function encodeCode128(data: string): boolean[] {
  const codes: number[] = [START_B];
  let checksum = START_B;

  for (let i = 0; i < data.length; i++) {
    const charCode = data.charCodeAt(i);
    if (charCode < 32 || charCode > 126) {
      throw new Error(`Character '${data[i]}' is not encodable in Code128-B`);
    }
    const val = charCode - 32;
    codes.push(val);
    checksum += val * (i + 1);
  }

  codes.push(checksum % 103);
  codes.push(STOP);

  const bars: boolean[] = [];
  for (const code of codes) {
    bars.push(...patternToBars(CODE128_PATTERNS[code]));
  }
  // Termination bar
  bars.push(true, true);
  return bars;
}

function barsToSvg(bars: boolean[], width: number, height: number, text: string, includeText: boolean): string {
  const quietZone = 10;
  const barWidth = Math.max(1, Math.floor((width - quietZone * 2) / bars.length));
  const totalWidth = quietZone * 2 + bars.length * barWidth;
  const textHeight = includeText ? 14 : 0;
  const totalHeight = height + textHeight;

  let rects = "";
  let x = quietZone;
  for (const filled of bars) {
    if (filled) {
      rects += `<rect x="${x}" y="0" width="${barWidth}" height="${height}" fill="black"/>`;
    }
    x += barWidth;
  }

  const textEl = includeText
    ? `<text x="${totalWidth / 2}" y="${height + 12}" text-anchor="middle" font-family="monospace" font-size="10" fill="black">${text}</text>`
    : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="${totalHeight}" viewBox="0 0 ${totalWidth} ${totalHeight}"><rect width="${totalWidth}" height="${totalHeight}" fill="white"/>${rects}${textEl}</svg>`;
}

function validateEan13(data: string): void {
  if (!/^\d{12,13}$/.test(data)) {
    throw new Error("EAN-13 requires 12 or 13 digits");
  }
}

function validateUpcA(data: string): void {
  if (!/^\d{12}$/.test(data)) {
    throw new Error("UPC-A requires exactly 12 digits");
  }
}

function validateCode39(data: string): void {
  if (!/^[A-Z0-9 \-.$/+%]*$/.test(data)) {
    throw new Error("Code39 supports uppercase A-Z, 0-9, and special chars: - . $ / + % space");
  }
}

// ── EAN / UPC encoding tables ──

const EAN_L: string[] = [
  "0001101","0011001","0010011","0111101","0100011",
  "0110001","0101111","0111011","0110111","0001011",
];
const EAN_G: string[] = [
  "0100111","0110011","0011011","0100001","0011101",
  "0111001","0000101","0010001","0001001","0010111",
];
const EAN_R: string[] = [
  "1110010","1100110","1101100","1000010","1011100",
  "1001110","1010000","1000100","1001000","1110100",
];
const EAN_PARITY: string[] = [
  "LLLLLL","LLGLGG","LLGGLG","LLGGGL","LGLLGG",
  "LGGLLG","LGGGLL","LGLGLG","LGLGGL","LGGLGL",
];

function eanCheckDigit(digits: number[]): number {
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += digits[i] * (i % 2 === 0 ? 1 : 3);
  }
  return (10 - (sum % 10)) % 10;
}

function encodeEan13(data: string): boolean[] {
  const digits = data.split("").map(Number);
  if (digits.length === 12) digits.push(eanCheckDigit(digits));

  const parity = EAN_PARITY[digits[0]];
  let bits = "101"; // start guard

  for (let i = 1; i <= 6; i++) {
    bits += parity[i - 1] === "L" ? EAN_L[digits[i]] : EAN_G[digits[i]];
  }
  bits += "01010"; // center guard
  for (let i = 7; i <= 12; i++) {
    bits += EAN_R[digits[i]];
  }
  bits += "101"; // end guard

  return bits.split("").map((c) => c === "1");
}

function encodeUpcA(data: string): boolean[] {
  const digits = data.split("").map(Number);
  if (digits.length === 11) digits.push(eanCheckDigit([0, ...digits]));

  let bits = "101"; // start guard
  for (let i = 0; i < 6; i++) {
    bits += EAN_L[digits[i]];
  }
  bits += "01010"; // center guard
  for (let i = 6; i < 12; i++) {
    bits += EAN_R[digits[i]];
  }
  bits += "101"; // end guard

  return bits.split("").map((c) => c === "1");
}

// ── Code 39 encoding ──

const CODE39_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-. $/+%";
const CODE39_PATTERNS: string[] = [
  "100010100","101000100","100010100","110000100","100100100",
  "110100000","100110000","100010010","110010000","101100000",
  "100101000","101001000","110001000","100100100","110100100",
  "101100100","100110100","110010100","101010000","100100010",
  "101000010","100000110","110000010","100000110","110000010",
  "100010010","110010010","101010010","100010001","110000001",
  "100000011","110000001","100010001","110010001","101010001",
  "100010100","100010010","100010001","101000001","100100001",
  "100100100","100100010","100010010","101001010",
];

function encodeCode39(data: string): boolean[] {
  // Code 39 wraps data with start/stop asterisks
  const toEncode = `*${data}*`;
  const bars: boolean[] = [];

  for (let i = 0; i < toEncode.length; i++) {
    const ch = toEncode[i];
    const idx = ch === "*" ? -1 : CODE39_CHARS.indexOf(ch);
    // Use a simple wide/narrow pattern — each char is 9 bars, interleaved with narrow space
    const pattern = idx === -1 ? "100101101" : CODE39_PATTERNS[idx] ?? "100101101";
    for (const c of pattern) {
      bars.push(c === "1");
    }
    if (i < toEncode.length - 1) bars.push(false); // inter-character space
  }

  return bars;
}

export class UnsupportedOperationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedOperationError";
  }
}

export class BarcodeScanner {
  private config: Required<BarcodeScanConfig>;
  private listeners: { [K in keyof EventMap]?: Listener<EventMap[K]>[] } = {};

  constructor(config: BarcodeScanConfig = {}) {
    this.config = {
      format: config.format ?? "code128",
      width: config.width ?? 200,
      height: config.height ?? 80,
      includeText: config.includeText ?? true,
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

  async generate(
    data: string,
    format: BarcodeFormat = this.config.format,
    outputFormat: OutputFormat = "svg"
  ): Promise<Uint8Array> {
    try {
      let bars: boolean[];

      switch (format) {
        case "ean13":
          validateEan13(data);
          bars = encodeEan13(data.slice(0, 13));
          break;
        case "upca":
          validateUpcA(data);
          bars = encodeUpcA(data);
          break;
        case "code39":
          validateCode39(data);
          bars = encodeCode39(data);
          break;
        case "code128":
        default:
          bars = encodeCode128(data);
          break;
      }

      const svg = barsToSvg(bars, this.config.width, this.config.height, data, this.config.includeText);
      const buf = new TextEncoder().encode(svg);

      if (outputFormat === "png") {
        throw new UnsupportedOperationError(
          "PNG output requires an external library such as sharp or canvas. Use outputFormat='svg' for zero-dep usage."
        );
      }

      this.emit("onGenerated", { data, format, bytes: buf.byteLength });
      return buf;
    } catch (err) {
      const error = err as Error;
      this.emit("onError", { code: "GENERATE_ERROR", message: error.message });
      throw err;
    }
  }

  async generateDataUrl(data: string, format: BarcodeFormat = this.config.format): Promise<string> {
    const buf = await this.generate(data, format, "svg");
    const binary = Array.from(buf).map((b) => String.fromCharCode(b)).join("");
    const base64 = typeof btoa === "function" ? btoa(binary) : globalThis.btoa(binary);
    return `data:image/svg+xml;base64,${base64}`;
  }

  async scan(_input: Uint8Array | string): Promise<ScanResult> {
    throw new UnsupportedOperationError(
      "scan() requires an image decoding library. " +
        "For real scanning, integrate with @zxing/library (browser) or use Jimp + zxing-wasm (Node.js). " +
        "Example: import { BrowserMultiFormatReader } from '@zxing/library';"
    );
  }
}

export default BarcodeScanner;
