// @radzor/email-send — Send emails via Resend, SendGrid, or SMTP

export type EmailProvider = "resend" | "sendgrid" | "smtp";

export interface EmailSendConfig {
  provider: EmailProvider;
  apiKey?: string;
  from: string;
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPass?: string;
  smtpSecure?: boolean;
}

export interface EmailMessage {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  cc?: string | string[];
  bcc?: string | string[];
  replyTo?: string;
  attachments?: EmailAttachment[];
}

export interface EmailAttachment {
  filename: string;
  content: string | Buffer;
  contentType?: string;
}

export interface SendResult {
  id: string;
  to: string[];
  status: "sent" | "queued";
}

export interface EmailError {
  code: string;
  message: string;
  provider: string;
}

export type EventMap = {
  onSent: SendResult;
  onError: EmailError;
};

export type Listener<T> = (event: T) => void;

export class EmailSend {
  private config: EmailSendConfig;
  private listeners: { [K in keyof EventMap]?: Listener<EventMap[K]>[] } = {};

  constructor(config: EmailSendConfig) {
    if (config.provider !== "smtp" && !config.apiKey) {
      throw new Error(`"apiKey" is required for provider "${config.provider}"`);
    }
    if (config.provider === "smtp" && !config.smtpHost) {
      throw new Error(`"smtpHost" is required for SMTP provider`);
    }
    this.config = config;
  }

  on<K extends keyof EventMap>(event: K, listener: Listener<EventMap[K]>): void {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event]!.push(listener);
  }

  private emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
    const list = this.listeners[event];
    if (list) list.forEach((l) => l(payload));
  }

  /** Send an email. */
  async send(message: EmailMessage): Promise<SendResult> {
    const toArray = Array.isArray(message.to) ? message.to : [message.to];

    if (!message.html && !message.text) {
      const err: EmailError = {
        code: "MISSING_CONTENT",
        message: "Either html or text content is required",
        provider: this.config.provider,
      };
      this.emit("onError", err);
      throw new Error(err.message);
    }

    try {
      let result: SendResult;

      switch (this.config.provider) {
        case "resend":
          result = await this.sendResend(message, toArray);
          break;
        case "sendgrid":
          result = await this.sendSendGrid(message, toArray);
          break;
        case "smtp":
          result = await this.sendSMTP(message, toArray);
          break;
      }

      this.emit("onSent", result);
      return result;
    } catch (err) {
      const emailError: EmailError = {
        code: "SEND_FAILED",
        message: (err as Error).message,
        provider: this.config.provider,
      };
      this.emit("onError", emailError);
      throw err;
    }
  }

  /** Send the same email to multiple recipients individually (not CC/BCC). */
  async sendBatch(
    recipients: string[],
    template: Omit<EmailMessage, "to">
  ): Promise<SendResult[]> {
    const results: SendResult[] = [];
    for (const to of recipients) {
      const result = await this.send({ ...template, to });
      results.push(result);
    }
    return results;
  }

  // ─── Resend ──────────────────────────────────────────────

  private async sendResend(
    message: EmailMessage,
    to: string[]
  ): Promise<SendResult> {
    const body: Record<string, unknown> = {
      from: this.config.from,
      to,
      subject: message.subject,
    };
    if (message.html) body.html = message.html;
    if (message.text) body.text = message.text;
    if (message.cc) body.cc = Array.isArray(message.cc) ? message.cc : [message.cc];
    if (message.bcc) body.bcc = Array.isArray(message.bcc) ? message.bcc : [message.bcc];
    if (message.replyTo) body.reply_to = message.replyTo;
    if (message.attachments) {
      body.attachments = message.attachments.map((a) => ({
        filename: a.filename,
        content: Buffer.isBuffer(a.content) ? a.content.toString("base64") : a.content,
        content_type: a.contentType,
      }));
    }

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`Resend API error ${res.status}: ${errBody}`);
    }

    const data = await res.json();
    return { id: data.id, to, status: "sent" };
  }

  // ─── SendGrid ────────────────────────────────────────────

  private async sendSendGrid(
    message: EmailMessage,
    to: string[]
  ): Promise<SendResult> {
    const personalizations: Record<string, unknown> = {
      to: to.map((email) => ({ email })),
    };
    if (message.cc) {
      const ccList = Array.isArray(message.cc) ? message.cc : [message.cc];
      personalizations.cc = ccList.map((email) => ({ email }));
    }
    if (message.bcc) {
      const bccList = Array.isArray(message.bcc) ? message.bcc : [message.bcc];
      personalizations.bcc = bccList.map((email) => ({ email }));
    }

    const body: Record<string, unknown> = {
      personalizations: [personalizations],
      from: { email: this.config.from },
      subject: message.subject,
      content: [],
    };

    const content = body.content as Array<{ type: string; value: string }>;
    if (message.text) content.push({ type: "text/plain", value: message.text });
    if (message.html) content.push({ type: "text/html", value: message.html });

    if (message.replyTo) {
      body.reply_to = { email: message.replyTo };
    }

    if (message.attachments) {
      body.attachments = message.attachments.map((a) => ({
        filename: a.filename,
        content: Buffer.isBuffer(a.content) ? a.content.toString("base64") : a.content,
        type: a.contentType,
        disposition: "attachment",
      }));
    }

    const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`SendGrid API error ${res.status}: ${errBody}`);
    }

    const messageId = res.headers.get("x-message-id") ?? crypto.randomUUID();
    return { id: messageId, to, status: "queued" };
  }

  // ─── SMTP ───────────────────────────────────────────────

  private async sendSMTP(
    message: EmailMessage,
    to: string[]
  ): Promise<SendResult> {
    const { createConnection } = await import("node:net");
    const { connect: tlsConnect } = await import("node:tls");

    const host = this.config.smtpHost!;
    const port = this.config.smtpPort ?? (this.config.smtpSecure ? 465 : 587);
    const secure = this.config.smtpSecure ?? port === 465;

    return new Promise((resolve, reject) => {
      const socket = secure
        ? tlsConnect({ host, port, rejectUnauthorized: true })
        : createConnection({ host, port });

      let buffer = "";
      let step = 0;
      const id = crypto.randomUUID();

      const boundary = `----radzor${Date.now()}`;
      const body = this.buildMimeBody(message, boundary);

      const commands = [
        `EHLO radzor.io\r\n`,
        ...(this.config.smtpUser
          ? [
              `AUTH LOGIN\r\n`,
              `${Buffer.from(this.config.smtpUser).toString("base64")}\r\n`,
              `${Buffer.from(this.config.smtpPass ?? "").toString("base64")}\r\n`,
            ]
          : []),
        `MAIL FROM:<${this.config.from}>\r\n`,
        ...to.map((addr) => `RCPT TO:<${addr}>\r\n`),
        `DATA\r\n`,
        `From: ${this.config.from}\r\nTo: ${to.join(", ")}\r\nSubject: ${message.subject}\r\nMIME-Version: 1.0\r\nContent-Type: ${message.html ? `multipart/alternative; boundary="${boundary}"` : "text/plain; charset=utf-8"}\r\n\r\n${body}\r\n.\r\n`,
        `QUIT\r\n`,
      ];

      socket.on("data", (data: Buffer) => {
        buffer += data.toString();
        if (!buffer.includes("\r\n")) return;

        const code = parseInt(buffer.slice(0, 3), 10);
        buffer = "";

        if (code >= 400) {
          socket.end();
          reject(new Error(`SMTP error ${code}`));
          return;
        }

        if (step < commands.length) {
          socket.write(commands[step++]);
        }
      });

      socket.on("end", () => resolve({ id, to, status: "sent" }));
      socket.on("error", (err: Error) => reject(err));

      socket.setTimeout(30000, () => {
        socket.end();
        reject(new Error("SMTP connection timeout"));
      });
    });
  }

  private buildMimeBody(message: EmailMessage, boundary: string): string {
    if (!message.html) return message.text ?? "";

    let body = "";
    if (message.text) {
      body += `--${boundary}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${message.text}\r\n`;
    }
    body += `--${boundary}\r\nContent-Type: text/html; charset=utf-8\r\n\r\n${message.html}\r\n`;
    body += `--${boundary}--`;
    return body;
  }
}

export default EmailSend;
