// @radzor/file-upload — Server-side file upload to S3-compatible storage, local disk, or Cloudflare R2

import { createReadStream, createWriteStream, existsSync, mkdirSync, statSync, unlinkSync } from "node:fs";
import { join, extname } from "node:path";
import { randomUUID } from "node:crypto";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

export type StorageProvider = "s3" | "local" | "r2";

export interface FileUploadConfig {
  provider: StorageProvider;
  bucket?: string;
  region?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  endpoint?: string;
  localDir?: string;
  maxSizeBytes?: number;
  allowedMimeTypes?: string[];
  pathPrefix?: string;
}

export interface UploadResult {
  id: string;
  url: string;
  path: string;
  size: number;
  mimeType: string;
  originalName: string;
}

export interface UploadProgress {
  bytesUploaded: number;
  totalBytes: number;
  percent: number;
}

export interface FileUploadError {
  code: string;
  message: string;
}

type EventMap = {
  onProgress: UploadProgress;
  onComplete: UploadResult;
  onError: FileUploadError;
};

type Listener<T> = (event: T) => void;

const DEFAULT_MAX_SIZE = 50 * 1024 * 1024; // 50MB
const DEFAULT_ALLOWED_TYPES = [
  "image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml",
  "application/pdf",
  "text/plain", "text/csv",
  "application/json",
  "application/zip",
];

export class FileUpload {
  private config: FileUploadConfig & { maxSizeBytes: number; allowedMimeTypes: string[] };
  private listeners: { [K in keyof EventMap]?: Listener<EventMap[K]>[] } = {};

  constructor(config: FileUploadConfig) {
    this.config = {
      ...config,
      maxSizeBytes: config.maxSizeBytes ?? DEFAULT_MAX_SIZE,
      allowedMimeTypes: config.allowedMimeTypes ?? DEFAULT_ALLOWED_TYPES,
    };

    if (config.provider === "local") {
      const dir = config.localDir ?? "./uploads";
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    }

    if ((config.provider === "s3" || config.provider === "r2") && !config.bucket) {
      throw new Error(`"bucket" is required for provider "${config.provider}"`);
    }
  }

  on<K extends keyof EventMap>(event: K, listener: Listener<EventMap[K]>): void {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event]!.push(listener);
  }

  private emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
    const list = this.listeners[event];
    if (list) list.forEach((l) => l(payload));
  }

  /** Upload a file from a Buffer or ReadableStream. */
  async upload(
    data: Buffer | ReadableStream<Uint8Array> | Readable,
    options: { fileName: string; mimeType: string }
  ): Promise<UploadResult> {
    const { fileName, mimeType } = options;

    // Validate mime type
    if (!this.config.allowedMimeTypes.includes(mimeType)) {
      const err: FileUploadError = {
        code: "INVALID_MIME_TYPE",
        message: `MIME type "${mimeType}" not allowed. Allowed: ${this.config.allowedMimeTypes.join(", ")}`,
      };
      this.emit("onError", err);
      throw new Error(err.message);
    }

    // Convert to Buffer for size check and upload
    let buffer: Buffer;
    if (Buffer.isBuffer(data)) {
      buffer = data;
    } else if (data instanceof Readable) {
      buffer = await this.readableToBuffer(data);
    } else {
      // ReadableStream (Web API)
      const reader = (data as ReadableStream<Uint8Array>).getReader();
      const chunks: Uint8Array[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }
      buffer = Buffer.concat(chunks);
    }

    // Validate size
    if (buffer.length > this.config.maxSizeBytes) {
      const err: FileUploadError = {
        code: "FILE_TOO_LARGE",
        message: `File size ${buffer.length} exceeds max ${this.config.maxSizeBytes} bytes`,
      };
      this.emit("onError", err);
      throw new Error(err.message);
    }

    const id = randomUUID();
    const ext = extname(fileName) || this.mimeToExt(mimeType);
    const prefix = this.config.pathPrefix ?? "";
    const storagePath = `${prefix}${id}${ext}`;

    this.emit("onProgress", {
      bytesUploaded: 0,
      totalBytes: buffer.length,
      percent: 0,
    });

    let url: string;

    switch (this.config.provider) {
      case "local":
        url = await this.uploadLocal(storagePath, buffer);
        break;
      case "s3":
      case "r2":
        url = await this.uploadS3(storagePath, buffer, mimeType);
        break;
    }

    this.emit("onProgress", {
      bytesUploaded: buffer.length,
      totalBytes: buffer.length,
      percent: 100,
    });

    const result: UploadResult = {
      id,
      url,
      path: storagePath,
      size: buffer.length,
      mimeType,
      originalName: fileName,
    };

    this.emit("onComplete", result);
    return result;
  }

  /** Delete a previously uploaded file. */
  async delete(path: string): Promise<void> {
    switch (this.config.provider) {
      case "local":
        await this.deleteLocal(path);
        break;
      case "s3":
      case "r2":
        await this.deleteS3(path);
        break;
    }
  }

  /** Generate a pre-signed URL for direct browser upload (S3/R2 only). */
  async getPresignedUrl(
    fileName: string,
    mimeType: string,
    expiresIn = 3600
  ): Promise<{ url: string; fields: Record<string, string>; path: string }> {
    if (this.config.provider === "local") {
      throw new Error("Pre-signed URLs not supported for local provider");
    }

    const id = randomUUID();
    const ext = extname(fileName) || this.mimeToExt(mimeType);
    const prefix = this.config.pathPrefix ?? "";
    const path = `${prefix}${id}${ext}`;

    // S3 PUT pre-signed URL via AWS v4 signing
    const url = await this.generatePresignedPutUrl(path, mimeType, expiresIn);

    return { url, fields: { "Content-Type": mimeType }, path };
  }

  // ─── Local Storage ───────────────────────────────────────

  private async uploadLocal(path: string, buffer: Buffer): Promise<string> {
    const dir = this.config.localDir ?? "./uploads";
    const fullPath = join(dir, path);
    const parentDir = fullPath.substring(0, fullPath.lastIndexOf("/"));
    if (parentDir && !existsSync(parentDir)) {
      mkdirSync(parentDir, { recursive: true });
    }

    const ws = createWriteStream(fullPath);
    await pipeline(Readable.from(buffer), ws);
    return `/uploads/${path}`;
  }

  private async deleteLocal(path: string): Promise<void> {
    const dir = this.config.localDir ?? "./uploads";
    const fullPath = join(dir, path);
    if (existsSync(fullPath)) unlinkSync(fullPath);
  }

  // ─── S3 / R2 ────────────────────────────────────────────

  private async uploadS3(path: string, buffer: Buffer, mimeType: string): Promise<string> {
    const endpoint = this.getS3Endpoint();
    const url = `${endpoint}/${path}`;

    const headers = await this.signS3Request("PUT", path, {
      "Content-Type": mimeType,
      "Content-Length": String(buffer.length),
    });

    const res = await fetch(url, {
      method: "PUT",
      headers,
      body: buffer,
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`S3 upload failed (${res.status}): ${body}`);
    }

    return url;
  }

  private async deleteS3(path: string): Promise<void> {
    const endpoint = this.getS3Endpoint();
    const url = `${endpoint}/${path}`;

    const headers = await this.signS3Request("DELETE", path, {});

    const res = await fetch(url, { method: "DELETE", headers });
    if (!res.ok && res.status !== 404) {
      const body = await res.text();
      throw new Error(`S3 delete failed (${res.status}): ${body}`);
    }
  }

  private async generatePresignedPutUrl(
    path: string,
    mimeType: string,
    expiresIn: number
  ): Promise<string> {
    // Simplified pre-signed URL generation using query string auth
    const endpoint = this.getS3Endpoint();
    const timestamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
    const date = timestamp.slice(0, 8);

    const params = new URLSearchParams({
      "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
      "X-Amz-Credential": `${this.config.accessKeyId}/${date}/${this.config.region}/s3/aws4_request`,
      "X-Amz-Date": timestamp,
      "X-Amz-Expires": String(expiresIn),
      "X-Amz-SignedHeaders": "content-type;host",
      "Content-Type": mimeType,
    });

    return `${endpoint}/${path}?${params.toString()}`;
  }

  private getS3Endpoint(): string {
    if (this.config.endpoint) {
      return `${this.config.endpoint}/${this.config.bucket}`;
    }
    if (this.config.provider === "r2") {
      throw new Error("R2 requires an explicit endpoint URL");
    }
    return `https://${this.config.bucket}.s3.${this.config.region ?? "us-east-1"}.amazonaws.com`;
  }

  private async signS3Request(
    method: string,
    path: string,
    headers: Record<string, string>
  ): Promise<Record<string, string>> {
    // Minimal AWS v4 signing (covers most use cases)
    const { createHmac, createHash } = await import("node:crypto");

    const now = new Date();
    const timestamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
    const date = timestamp.slice(0, 8);
    const region = this.config.region ?? "us-east-1";
    const service = "s3";

    const host = new URL(this.getS3Endpoint()).host;
    const allHeaders: Record<string, string> = {
      ...headers,
      host,
      "x-amz-date": timestamp,
      "x-amz-content-sha256": "UNSIGNED-PAYLOAD",
    };

    const sortedHeaderKeys = Object.keys(allHeaders).sort();
    const canonicalHeaders = sortedHeaderKeys.map((k) => `${k}:${allHeaders[k]}\n`).join("");
    const signedHeaders = sortedHeaderKeys.join(";");

    const canonicalRequest = [
      method,
      `/${path}`,
      "",
      canonicalHeaders,
      signedHeaders,
      "UNSIGNED-PAYLOAD",
    ].join("\n");

    const scope = `${date}/${region}/${service}/aws4_request`;
    const stringToSign = [
      "AWS4-HMAC-SHA256",
      timestamp,
      scope,
      createHash("sha256").update(canonicalRequest).digest("hex"),
    ].join("\n");

    const hmac = (key: Buffer | string, data: string) =>
      createHmac("sha256", key).update(data).digest();

    let signingKey = hmac(`AWS4${this.config.secretAccessKey}`, date);
    signingKey = hmac(signingKey, region);
    signingKey = hmac(signingKey, service);
    signingKey = hmac(signingKey, "aws4_request");

    const signature = createHmac("sha256", signingKey).update(stringToSign).digest("hex");

    return {
      ...allHeaders,
      Authorization: `AWS4-HMAC-SHA256 Credential=${this.config.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    };
  }

  // ─── Helpers ─────────────────────────────────────────────

  private async readableToBuffer(stream: Readable): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  private mimeToExt(mime: string): string {
    const map: Record<string, string> = {
      "image/jpeg": ".jpg",
      "image/png": ".png",
      "image/gif": ".gif",
      "image/webp": ".webp",
      "image/svg+xml": ".svg",
      "application/pdf": ".pdf",
      "text/plain": ".txt",
      "text/csv": ".csv",
      "application/json": ".json",
      "application/zip": ".zip",
    };
    return map[mime] ?? "";
  }
}

export default FileUpload;
