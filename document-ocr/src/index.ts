// @radzor/document-ocr — OCR via Tesseract CLI, Google Vision, or Azure Computer Vision

import { execFile } from "child_process";
import { writeFileSync, unlinkSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export type OcrProvider = "tesseract" | "google-vision" | "azure";

export interface DocumentOcrConfig {
  provider?: OcrProvider;
  apiKey?: string;
  azureEndpoint?: string;
  azureKey?: string;
  language?: string;
}

export interface ExtractionResult {
  text: string;
  pages: Array<{ pageNumber: number; text: string; confidence: number }>;
  confidence: number;
}

export interface StructuredData {
  tables: Array<Array<string[]>>;
  fields: Record<string, string>;
  lines: string[];
}

export interface PageExtractedEvent {
  pageNumber: number;
  text: string;
  confidence: number;
}

export interface OcrError {
  code: string;
  message: string;
}

export type EventMap = {
  onPageExtracted: PageExtractedEvent;
  onError: OcrError;
};

export type Listener<T> = (event: T) => void;

function tmpFile(ext: string): string {
  return join(tmpdir(), `radzor-ocr-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`);
}

async function runTesseract(inputPath: string, language: string): Promise<{ text: string; confidence: number }> {
  const outputBase = tmpFile("out");
  try {
    await execFileAsync("tesseract", [inputPath, outputBase, "-l", language, "--psm", "3"]);
    const text = readFileSync(`${outputBase}.txt`, "utf8").trim();
    // Tesseract doesn't return confidence via stdout; use a fixed estimate
    return { text, confidence: 0.85 };
  } finally {
    try { unlinkSync(`${outputBase}.txt`); } catch { /* ignore */ }
  }
}

async function callGoogleVision(
  imageBase64: string,
  apiKey: string
): Promise<{ text: string; confidence: number; blocks: unknown[] }> {
  const url = `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`;
  const body = {
    requests: [
      {
        image: { content: imageBase64 },
        features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
      },
    ],
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Google Vision API error ${res.status}: ${err}`);
  }

  const json = (await res.json()) as {
    responses: Array<{
      fullTextAnnotation?: { text: string; pages?: unknown[] };
      textAnnotations?: Array<{ description: string; confidence?: number }>;
    }>;
  };

  const response = json.responses[0];
  const fullText = response?.fullTextAnnotation?.text ?? response?.textAnnotations?.[0]?.description ?? "";
  const blocks = (response?.fullTextAnnotation?.pages as unknown[]) ?? [];
  return { text: fullText, confidence: 0.9, blocks };
}

async function callAzureOcr(
  imageBuffer: Buffer,
  endpoint: string,
  key: string
): Promise<{ text: string; lines: string[]; confidence: number }> {
  const url = `${endpoint.replace(/\/$/, "")}/computervision/imageanalysis:analyze?api-version=2023-02-01-preview&features=read`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": key,
      "Content-Type": "application/octet-stream",
    },
    body: imageBuffer,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Azure OCR error ${res.status}: ${err}`);
  }

  const json = (await res.json()) as {
    readResult?: {
      blocks?: Array<{ lines?: Array<{ text: string; words?: Array<{ confidence?: number }> }> }>;
    };
  };

  const blocks = json.readResult?.blocks ?? [];
  const lines: string[] = [];
  let totalConf = 0;
  let wordCount = 0;

  for (const block of blocks) {
    for (const line of block.lines ?? []) {
      lines.push(line.text);
      for (const word of line.words ?? []) {
        totalConf += word.confidence ?? 0.9;
        wordCount++;
      }
    }
  }

  const text = lines.join("\n");
  const confidence = wordCount > 0 ? totalConf / wordCount : 0.9;
  return { text, lines, confidence };
}

export class DocumentOcr {
  private config: Required<DocumentOcrConfig>;
  private listeners: { [K in keyof EventMap]?: Listener<EventMap[K]>[] } = {};

  constructor(config: DocumentOcrConfig = {}) {
    this.config = {
      provider: config.provider ?? "tesseract",
      apiKey: config.apiKey ?? "",
      azureEndpoint: config.azureEndpoint ?? "",
      azureKey: config.azureKey ?? "",
      language: config.language ?? "eng",
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

  private toBuffer(input: Buffer | string): Buffer {
    if (Buffer.isBuffer(input)) return input;
    if (input.startsWith("data:")) {
      const base64 = input.split(",")[1];
      return Buffer.from(base64, "base64");
    }
    return readFileSync(input);
  }

  async extractText(input: Buffer | string): Promise<ExtractionResult> {
    try {
      const buf = this.toBuffer(input);
      let text = "";
      let confidence = 0;

      if (this.config.provider === "tesseract") {
        const imgPath = tmpFile("png");
        writeFileSync(imgPath, buf);
        try {
          const result = await runTesseract(imgPath, this.config.language);
          text = result.text;
          confidence = result.confidence;
        } finally {
          try { unlinkSync(imgPath); } catch { /* ignore */ }
        }
      } else if (this.config.provider === "google-vision") {
        if (!this.config.apiKey) throw new Error("apiKey required for google-vision provider");
        const base64 = buf.toString("base64");
        const result = await callGoogleVision(base64, this.config.apiKey);
        text = result.text;
        confidence = result.confidence;
      } else if (this.config.provider === "azure") {
        if (!this.config.azureEndpoint || !this.config.azureKey) {
          throw new Error("azureEndpoint and azureKey required for azure provider");
        }
        const result = await callAzureOcr(buf, this.config.azureEndpoint, this.config.azureKey);
        text = result.text;
        confidence = result.confidence;
      }

      const page = { pageNumber: 1, text, confidence };
      this.emit("onPageExtracted", page);

      return { text, pages: [page], confidence };
    } catch (err) {
      const error = err as Error;
      this.emit("onError", { code: "EXTRACTION_ERROR", message: error.message });
      throw err;
    }
  }

  async extractPage(input: Buffer | string, pageNumber: number): Promise<{ text: string; confidence: number }> {
    const result = await this.extractText(input);
    const page = result.pages.find((p) => p.pageNumber === pageNumber);
    if (!page) throw new Error(`Page ${pageNumber} not found`);
    return { text: page.text, confidence: page.confidence };
  }

  async extractStructured(input: Buffer | string): Promise<StructuredData> {
    if (this.config.provider === "tesseract") {
      throw new Error(
        "extractStructured() is not supported for the tesseract provider. Use google-vision or azure for structured extraction."
      );
    }

    try {
      const buf = this.toBuffer(input);
      let lines: string[] = [];

      if (this.config.provider === "google-vision") {
        if (!this.config.apiKey) throw new Error("apiKey required for google-vision provider");
        const base64 = buf.toString("base64");
        const result = await callGoogleVision(base64, this.config.apiKey);
        lines = result.text.split("\n").filter(Boolean);
      } else if (this.config.provider === "azure") {
        if (!this.config.azureEndpoint || !this.config.azureKey) {
          throw new Error("azureEndpoint and azureKey required for azure provider");
        }
        const result = await callAzureOcr(buf, this.config.azureEndpoint, this.config.azureKey);
        lines = result.lines;
      }

      // Heuristic: detect key:value fields (lines matching "Label: Value")
      const fields: Record<string, string> = {};
      const tableLines: string[] = [];
      for (const line of lines) {
        const match = line.match(/^([A-Za-z][A-Za-z\s]{1,30}):\s*(.+)$/);
        if (match) {
          fields[match[1].trim()] = match[2].trim();
        } else if (line.includes("\t") || /\s{3,}/.test(line)) {
          tableLines.push(line);
        }
      }

      // Simple table detection: consecutive whitespace-separated columns
      const tables: Array<Array<string[]>> = tableLines.length > 0
        ? [tableLines.map((l) => l.split(/\s{2,}|\t/).map((c) => c.trim()))]
        : [];

      return { tables, fields, lines };
    } catch (err) {
      const error = err as Error;
      this.emit("onError", { code: "STRUCTURED_ERROR", message: error.message });
      throw err;
    }
  }
}

export default DocumentOcr;
