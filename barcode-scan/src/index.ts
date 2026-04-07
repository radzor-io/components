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
  ): Promise<Buffer> {
    try {
      let bars: boolean[];

      switch (format) {
        case "ean13":
          validateEan13(data);
          bars = encodeCode128(data.slice(0, 13));
          break;
        case "upca":
          validateUpcA(data);
          bars = encodeCode128(data);
          break;
        case "code39":
          validateCode39(data);
          bars = encodeCode128(data);
          break;
        case "code128":
        default:
          bars = encodeCode128(data);
          break;
      }

      const svg = barsToSvg(bars, this.config.width, this.config.height, data, this.config.includeText);
      const buf = Buffer.from(svg, "utf8");

      if (outputFormat === "png") {
        throw new UnsupportedOperationError(
          "PNG output requires an external library such as sharp or canvas. Use outputFormat='svg' for zero-dep usage."
        );
      }

      this.emit("onGenerated", { data, format, bytes: buf.length });
      return buf;
    } catch (err) {
      const error = err as Error;
      this.emit("onError", { code: "GENERATE_ERROR", message: error.message });
      throw err;
    }
  }

  async generateDataUrl(data: string, format: BarcodeFormat = this.config.format): Promise<string> {
    const buf = await this.generate(data, format, "svg");
    const base64 = buf.toString("base64");
    return `data:image/svg+xml;base64,${base64}`;
  }

  async scan(_input: Buffer | string): Promise<ScanResult> {
    throw new UnsupportedOperationError(
      "scan() requires an image decoding library. " +
        "For real scanning, integrate with @zxing/library (browser) or use Jimp + zxing-wasm (Node.js). " +
        "Example: import { BrowserMultiFormatReader } from '@zxing/library';"
    );
  }
}

export default BarcodeScanner;
