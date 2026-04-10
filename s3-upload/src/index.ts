// @radzor/s3-upload — Upload/download files to S3-compatible storage with AWS Signature V4

import * as crypto from "crypto";

// ---- types ----

export interface S3Config {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  bucket: string;
  endpoint?: string;
}

export interface UploadResult {
  key: string;
  etag: string;
  url: string;
}

export interface DownloadResult {
  body: Buffer;
  contentType: string;
  etag: string;
}

export interface S3Object {
  key: string;
  size: number;
  lastModified: string;
}

export type EventMap = {
  onUploadComplete: { key: string; bucket: string; size: number; etag: string };
};

type Listener<T> = (payload: T) => void;

// ---- AWS Signature V4 ----

function hmacSha256(key: Buffer | string, data: string): Buffer {
  return crypto.createHmac("sha256", key).update(data, "utf8").digest();
}

function sha256(data: string | Buffer): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

function getSigningKey(
  secretKey: string,
  dateStamp: string,
  region: string,
  service: string
): Buffer {
  const kDate = hmacSha256(`AWS4${secretKey}`, dateStamp);
  const kRegion = hmacSha256(kDate, region);
  const kService = hmacSha256(kRegion, service);
  return hmacSha256(kService, "aws4_request");
}

function formatAmzDate(date: Date): { amzDate: string; dateStamp: string } {
  const iso = date.toISOString().replace(/[:-]|\.\d{3}/g, "");
  return { amzDate: iso, dateStamp: iso.slice(0, 8) };
}

interface SignedRequest {
  url: string;
  headers: Record<string, string>;
}

function signRequest(
  method: string,
  url: URL,
  headers: Record<string, string>,
  body: string | Buffer | "",
  config: S3Config
): SignedRequest {
  const { amzDate, dateStamp } = formatAmzDate(new Date());
  const service = "s3";
  const scope = `${dateStamp}/${config.region}/${service}/aws4_request`;

  // Add required headers
  headers["x-amz-date"] = amzDate;
  headers["x-amz-content-sha256"] = sha256(body);
  headers["host"] = url.host;

  // Canonical headers (sorted)
  const signedHeaderKeys = Object.keys(headers)
    .map((k) => k.toLowerCase())
    .sort();
  const canonicalHeaders = signedHeaderKeys
    .map((k) => `${k}:${headers[Object.keys(headers).find((h) => h.toLowerCase() === k)!].trim()}`)
    .join("\n") + "\n";
  const signedHeaders = signedHeaderKeys.join(";");

  // Canonical request
  const canonicalUri = url.pathname
    .split("/")
    .map((s) => encodeURIComponent(s))
    .join("/");
  const canonicalQuerystring = [...url.searchParams]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");

  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQuerystring,
    canonicalHeaders,
    signedHeaders,
    sha256(body),
  ].join("\n");

  // String to sign
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    scope,
    sha256(canonicalRequest),
  ].join("\n");

  // Signature
  const signingKey = getSigningKey(config.secretAccessKey, dateStamp, config.region, service);
  const signature = hmacSha256(signingKey, stringToSign).toString("hex");

  headers["Authorization"] =
    `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return { url: url.toString(), headers };
}

// ---- implementation ----

export class S3Upload {
  private config: S3Config;
  private listeners: { [K in keyof EventMap]?: Array<Listener<EventMap[K]>> } = {};

  constructor(config: S3Config) {
    this.config = config;
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

  private getBaseUrl(): string {
    if (this.config.endpoint) {
      const ep = this.config.endpoint.replace(/\/$/, "");
      return `${ep}/${this.config.bucket}`;
    }
    return `https://${this.config.bucket}.s3.${this.config.region}.amazonaws.com`;
  }

  private getObjectUrl(key: string): string {
    return `${this.getBaseUrl()}/${key}`;
  }

  async upload(
    key: string,
    body: Buffer | string,
    contentType?: string,
    metadata?: Record<string, string>
  ): Promise<UploadResult> {
    const bodyBuf = typeof body === "string" ? Buffer.from(body, "utf-8") : body;
    const url = new URL(this.getObjectUrl(key));

    const headers: Record<string, string> = {
      "Content-Type": contentType ?? "application/octet-stream",
      "Content-Length": String(bodyBuf.length),
    };

    // Add custom metadata headers
    if (metadata) {
      for (const [k, v] of Object.entries(metadata)) {
        headers[`x-amz-meta-${k}`] = v;
      }
    }

    const signed = signRequest("PUT", url, headers, bodyBuf, this.config);

    const res = await fetch(signed.url, {
      method: "PUT",
      headers: signed.headers,
      body: bodyBuf,
    });

    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`S3 upload error ${res.status}: ${errBody}`);
    }

    const etag = res.headers.get("etag")?.replace(/"/g, "") ?? "";

    const result: UploadResult = {
      key,
      etag,
      url: this.getObjectUrl(key),
    };

    this.emit("onUploadComplete", {
      key,
      bucket: this.config.bucket,
      size: bodyBuf.length,
      etag,
    });

    return result;
  }

  async download(key: string): Promise<DownloadResult> {
    const url = new URL(this.getObjectUrl(key));
    const headers: Record<string, string> = {};
    const signed = signRequest("GET", url, headers, "", this.config);

    const res = await fetch(signed.url, {
      method: "GET",
      headers: signed.headers,
    });

    if (!res.ok) {
      if (res.status === 404) throw new Error(`Object not found: ${key}`);
      const errBody = await res.text();
      throw new Error(`S3 download error ${res.status}: ${errBody}`);
    }

    const arrayBuf = await res.arrayBuffer();
    return {
      body: Buffer.from(arrayBuf),
      contentType: res.headers.get("content-type") ?? "application/octet-stream",
      etag: res.headers.get("etag")?.replace(/"/g, "") ?? "",
    };
  }

  async delete(key: string): Promise<void> {
    const url = new URL(this.getObjectUrl(key));
    const headers: Record<string, string> = {};
    const signed = signRequest("DELETE", url, headers, "", this.config);

    const res = await fetch(signed.url, {
      method: "DELETE",
      headers: signed.headers,
    });

    if (!res.ok && res.status !== 204) {
      const errBody = await res.text();
      throw new Error(`S3 delete error ${res.status}: ${errBody}`);
    }
  }

  async listObjects(
    prefix?: string,
    maxKeys?: number
  ): Promise<S3Object[]> {
    const url = new URL(this.getBaseUrl());
    url.searchParams.set("list-type", "2");
    if (prefix) url.searchParams.set("prefix", prefix);
    url.searchParams.set("max-keys", String(maxKeys ?? 1000));

    const headers: Record<string, string> = {};
    const signed = signRequest("GET", url, headers, "", this.config);

    const res = await fetch(signed.url, {
      method: "GET",
      headers: signed.headers,
    });

    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`S3 list error ${res.status}: ${errBody}`);
    }

    const xml = await res.text();
    return this.parseListXml(xml);
  }

  async getSignedUrl(key: string, expiresIn?: number): Promise<string> {
    const ttl = expiresIn ?? 3600;
    const now = new Date();
    const { amzDate, dateStamp } = formatAmzDate(now);
    const scope = `${dateStamp}/${this.config.region}/s3/aws4_request`;

    const url = new URL(this.getObjectUrl(key));
    url.searchParams.set("X-Amz-Algorithm", "AWS4-HMAC-SHA256");
    url.searchParams.set(
      "X-Amz-Credential",
      `${this.config.accessKeyId}/${scope}`
    );
    url.searchParams.set("X-Amz-Date", amzDate);
    url.searchParams.set("X-Amz-Expires", String(ttl));
    url.searchParams.set("X-Amz-SignedHeaders", "host");

    const canonicalUri = url.pathname
      .split("/")
      .map((s) => encodeURIComponent(s))
      .join("/");
    const canonicalQuerystring = [...url.searchParams]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join("&");

    const canonicalRequest = [
      "GET",
      canonicalUri,
      canonicalQuerystring,
      `host:${url.host}\n`,
      "host",
      "UNSIGNED-PAYLOAD",
    ].join("\n");

    const stringToSign = [
      "AWS4-HMAC-SHA256",
      amzDate,
      scope,
      sha256(canonicalRequest),
    ].join("\n");

    const signingKey = getSigningKey(
      this.config.secretAccessKey,
      dateStamp,
      this.config.region,
      "s3"
    );
    const signature = hmacSha256(signingKey, stringToSign).toString("hex");

    url.searchParams.set("X-Amz-Signature", signature);
    return url.toString();
  }

  private parseListXml(xml: string): S3Object[] {
    const objects: S3Object[] = [];
    const contentRegex = /<Contents>([\s\S]*?)<\/Contents>/g;
    let match: RegExpExecArray | null;

    while ((match = contentRegex.exec(xml)) !== null) {
      const block = match[1];
      const key = block.match(/<Key>(.*?)<\/Key>/)?.[1] ?? "";
      const size = parseInt(block.match(/<Size>(.*?)<\/Size>/)?.[1] ?? "0", 10);
      const lastModified = block.match(/<LastModified>(.*?)<\/LastModified>/)?.[1] ?? "";

      objects.push({ key, size, lastModified });
    }

    return objects;
  }
}

export default S3Upload;
