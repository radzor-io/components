// @radzor/inbox-parser — Parse raw MIME emails into structured data

export interface InboxParserConfig {
  maxAttachmentSize?: number;
  decodeCharsets?: boolean;
}

export interface EmailAddress {
  name: string;
  email: string;
}

export interface Attachment {
  filename: string;
  contentType: string;
  size: number;
  content: Buffer;
  contentId?: string;
}

export interface ParsedEmail {
  messageId: string;
  from: EmailAddress;
  to: EmailAddress[];
  cc: EmailAddress[];
  subject: string;
  date: string;
  html?: string;
  text?: string;
  attachments: Attachment[];
  headers: Record<string, string>;
}

export type EventMap = {
  onParsed: { messageId: string; subject: string; attachmentCount: number };
  onError: { message: string; phase: string };
};

export type Listener<T> = (event: T) => void;

export class InboxParser {
  private config: Required<InboxParserConfig>;
  private listeners: { [K in keyof EventMap]?: Listener<EventMap[K]>[] } = {};

  constructor(config: InboxParserConfig = {}) {
    this.config = {
      maxAttachmentSize: config.maxAttachmentSize ?? 10 * 1024 * 1024,
      decodeCharsets: config.decodeCharsets ?? true,
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

  /** Parse a raw MIME email into structured data. */
  async parse(rawEmail: string | Buffer): Promise<ParsedEmail> {
    const raw = typeof rawEmail === "string" ? rawEmail : rawEmail.toString("utf-8");

    try {
      const { headers, body } = this.splitHeadersAndBody(raw);
      const parsedHeaders = this.parseHeaders(headers);

      const contentType = parsedHeaders["content-type"] ?? "text/plain";
      const boundary = this.extractBoundary(contentType);

      let text: string | undefined;
      let html: string | undefined;
      const attachments: Attachment[] = [];

      if (boundary) {
        // Multipart message
        const parts = this.splitMultipart(body, boundary);
        this.processParts(parts, attachments, (t) => (text = t), (h) => (html = h));
      } else {
        // Single part
        const encoding = parsedHeaders["content-transfer-encoding"] ?? "7bit";
        const decoded = this.decodeBody(body, encoding);

        if (contentType.includes("text/html")) {
          html = decoded;
        } else {
          text = decoded;
        }
      }

      const result: ParsedEmail = {
        messageId: this.cleanHeaderValue(parsedHeaders["message-id"] ?? ""),
        from: this.parseAddressList(parsedHeaders["from"] ?? "")[0] ?? { name: "", email: "" },
        to: this.parseAddressList(parsedHeaders["to"] ?? ""),
        cc: this.parseAddressList(parsedHeaders["cc"] ?? ""),
        subject: this.decodeEncodedWords(parsedHeaders["subject"] ?? ""),
        date: this.parseDate(parsedHeaders["date"] ?? ""),
        html,
        text,
        attachments,
        headers: parsedHeaders,
      };

      this.emit("onParsed", {
        messageId: result.messageId,
        subject: result.subject,
        attachmentCount: attachments.length,
      });

      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.emit("onError", { message, phase: "parse" });
      throw err;
    }
  }

  /** Extract only attachments from a raw MIME email. */
  async extractAttachments(rawEmail: string | Buffer): Promise<Attachment[]> {
    const parsed = await this.parse(rawEmail);
    return parsed.attachments;
  }

  private splitHeadersAndBody(raw: string): { headers: string; body: string } {
    // Headers and body are separated by a blank line (\r\n\r\n or \n\n)
    const separator = raw.includes("\r\n\r\n") ? "\r\n\r\n" : "\n\n";
    const idx = raw.indexOf(separator);
    if (idx === -1) {
      return { headers: raw, body: "" };
    }
    return {
      headers: raw.slice(0, idx),
      body: raw.slice(idx + separator.length),
    };
  }

  private parseHeaders(headerBlock: string): Record<string, string> {
    const headers: Record<string, string> = {};
    // Unfold continuation lines (lines starting with whitespace are continuations)
    const unfolded = headerBlock.replace(/\r?\n([ \t]+)/g, " ");
    const lines = unfolded.split(/\r?\n/);

    for (const line of lines) {
      const colonIdx = line.indexOf(":");
      if (colonIdx === -1) continue;
      const key = line.slice(0, colonIdx).trim().toLowerCase();
      const value = line.slice(colonIdx + 1).trim();
      headers[key] = value;
    }

    return headers;
  }

  private extractBoundary(contentType: string): string | null {
    const match = contentType.match(/boundary\s*=\s*"?([^";\s]+)"?/i);
    return match ? match[1] : null;
  }

  private splitMultipart(body: string, boundary: string): string[] {
    const delimiter = `--${boundary}`;
    const endDelimiter = `--${boundary}--`;

    const parts = body.split(delimiter);
    const result: string[] = [];

    for (let i = 1; i < parts.length; i++) {
      let part = parts[i];
      if (part.trim().startsWith("--")) continue; // End delimiter
      if (part.startsWith(endDelimiter)) continue;
      // Remove trailing -- marker
      const endIdx = part.indexOf(endDelimiter);
      if (endIdx !== -1) {
        part = part.slice(0, endIdx);
      }
      result.push(part.replace(/^\r?\n/, ""));
    }

    return result;
  }

  private processParts(
    parts: string[],
    attachments: Attachment[],
    setText: (t: string) => void,
    setHtml: (h: string) => void
  ): void {
    for (const part of parts) {
      const { headers, body } = this.splitHeadersAndBody(part);
      const partHeaders = this.parseHeaders(headers);
      const contentType = partHeaders["content-type"] ?? "text/plain";
      const encoding = partHeaders["content-transfer-encoding"] ?? "7bit";
      const disposition = partHeaders["content-disposition"] ?? "";
      const contentId = partHeaders["content-id"];

      // Check for nested multipart
      const nestedBoundary = this.extractBoundary(contentType);
      if (nestedBoundary) {
        const nestedParts = this.splitMultipart(body, nestedBoundary);
        this.processParts(nestedParts, attachments, setText, setHtml);
        continue;
      }

      // Check if this is an attachment
      const isAttachment =
        disposition.includes("attachment") ||
        (disposition.includes("inline") && !contentType.startsWith("text/"));

      if (isAttachment) {
        const filename = this.extractFilename(disposition, contentType);
        const content = this.decodeBodyToBuffer(body.trim(), encoding);

        if (content.length <= this.config.maxAttachmentSize) {
          attachments.push({
            filename,
            contentType: contentType.split(";")[0].trim(),
            size: content.length,
            content,
            contentId: contentId ? this.cleanHeaderValue(contentId) : undefined,
          });
        }
      } else if (contentType.includes("text/html")) {
        setHtml(this.decodeBody(body.trim(), encoding));
      } else if (contentType.includes("text/plain")) {
        setText(this.decodeBody(body.trim(), encoding));
      }
    }
  }

  private extractFilename(disposition: string, contentType: string): string {
    // Try Content-Disposition filename
    let match = disposition.match(/filename\*?=\s*(?:UTF-8''|")?([^";\s]+)"?/i);
    if (match) return decodeURIComponent(match[1]);

    // Try Content-Type name
    match = contentType.match(/name\s*=\s*"?([^";\s]+)"?/i);
    if (match) return decodeURIComponent(match[1]);

    return "attachment";
  }

  private decodeBody(body: string, encoding: string): string {
    const enc = encoding.toLowerCase().trim();
    switch (enc) {
      case "base64":
        return Buffer.from(body.replace(/\s/g, ""), "base64").toString("utf-8");
      case "quoted-printable":
        return this.decodeQuotedPrintable(body);
      default:
        return body;
    }
  }

  private decodeBodyToBuffer(body: string, encoding: string): Buffer {
    const enc = encoding.toLowerCase().trim();
    switch (enc) {
      case "base64":
        return Buffer.from(body.replace(/\s/g, ""), "base64");
      case "quoted-printable":
        return Buffer.from(this.decodeQuotedPrintable(body), "utf-8");
      default:
        return Buffer.from(body, "utf-8");
    }
  }

  private decodeQuotedPrintable(input: string): string {
    return input
      .replace(/=\r?\n/g, "") // Soft line breaks
      .replace(/=([0-9A-Fa-f]{2})/g, (_match, hex) =>
        String.fromCharCode(parseInt(hex, 16))
      );
  }

  private decodeEncodedWords(header: string): string {
    // RFC 2047 encoded words: =?charset?encoding?text?=
    return header.replace(
      /=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g,
      (_match, _charset: string, encoding: string, text: string) => {
        if (encoding.toUpperCase() === "B") {
          return Buffer.from(text, "base64").toString("utf-8");
        } else {
          // Q encoding (similar to quoted-printable, _ = space)
          const decoded = text
            .replace(/_/g, " ")
            .replace(/=([0-9A-Fa-f]{2})/g, (_m, hex) =>
              String.fromCharCode(parseInt(hex, 16))
            );
          return decoded;
        }
      }
    );
  }

  private parseAddressList(header: string): EmailAddress[] {
    if (!header.trim()) return [];

    const addresses: EmailAddress[] = [];
    // Split by comma, but not within quotes
    const parts = header.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/);

    for (const part of parts) {
      const trimmed = part.trim();
      if (!trimmed) continue;

      // "Name" <email> or Name <email>
      const match = trimmed.match(/(?:"?([^"<]*)"?\s*)?<?([^>]+@[^>]+)>?/);
      if (match) {
        addresses.push({
          name: (match[1] ?? "").trim(),
          email: match[2].trim(),
        });
      }
    }

    return addresses;
  }

  private parseDate(dateStr: string): string {
    try {
      const date = new Date(dateStr);
      return isNaN(date.getTime()) ? dateStr : date.toISOString();
    } catch {
      return dateStr;
    }
  }

  private cleanHeaderValue(value: string): string {
    return value.replace(/^<|>$/g, "").trim();
  }
}

export default InboxParser;
