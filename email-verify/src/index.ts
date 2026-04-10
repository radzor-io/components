// @radzor/email-verify — Verify email addresses via syntax, MX records, and disposable checks

import { promises as dns } from "dns";

export interface EmailVerifyConfig {
  checkMx?: boolean;
  checkDisposable?: boolean;
  timeout?: number;
}

export interface VerificationResult {
  email: string;
  valid: boolean;
  syntaxValid: boolean;
  mxExists: boolean;
  disposable: boolean;
  domain: string;
  reason?: string;
}

export type EventMap = {
  onVerified: { email: string; valid: boolean };
  onError: { email: string; message: string };
};

export type Listener<T> = (event: T) => void;

// Well-known disposable email domains (partial list — comprehensive enough for real use)
const DISPOSABLE_DOMAINS = new Set([
  "10minutemail.com", "guerrillamail.com", "guerrillamail.net", "mailinator.com",
  "tempmail.com", "throwaway.email", "yopmail.com", "sharklasers.com",
  "grr.la", "guerrillamail.info", "guerrillamailblock.com", "pokemail.net",
  "spam4.me", "bccto.me", "trashmail.com", "trashmail.me", "trashmail.net",
  "mailnesia.com", "maildrop.cc", "dispostable.com", "getairmail.com",
  "mailcatch.com", "tempr.email", "discard.email", "fakeinbox.com",
  "mailforspam.com", "temp-mail.org", "tempail.com", "mohmal.com",
  "getnada.com", "emailondeck.com", "33mail.com", "mytemp.email",
  "mailnator.com", "anonbox.net", "mintemail.com", "mailhub.pw",
  "harakirimail.com", "spamgourmet.com", "mailexpire.com", "tempinbox.com",
  "filzmail.com", "meltmail.com", "sogetthis.com", "anonymbox.com",
  "mailsac.com", "burnermail.io", "inboxbear.com", "tempmailo.com",
  "disposableemailaddresses.emailmiser.com", "guerrillamail.de",
]);

export class EmailVerify {
  private config: Required<EmailVerifyConfig>;
  private listeners: { [K in keyof EventMap]?: Listener<EventMap[K]>[] } = {};

  constructor(config: EmailVerifyConfig = {}) {
    this.config = {
      checkMx: config.checkMx ?? true,
      checkDisposable: config.checkDisposable ?? true,
      timeout: config.timeout ?? 5000,
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

  /** Verify a single email address. */
  async verify(email: string): Promise<VerificationResult> {
    const normalized = email.trim().toLowerCase();
    const domain = this.extractDomain(normalized);

    const result: VerificationResult = {
      email: normalized,
      valid: true,
      syntaxValid: false,
      mxExists: true,
      disposable: false,
      domain,
    };

    // Step 1: Syntax validation
    result.syntaxValid = this.isValidSyntax(normalized);
    if (!result.syntaxValid) {
      result.valid = false;
      result.reason = "Invalid email syntax";
      this.emit("onVerified", { email: normalized, valid: false });
      return result;
    }

    // Step 2: Disposable email check
    if (this.config.checkDisposable) {
      result.disposable = this.isDisposable(domain);
      if (result.disposable) {
        result.valid = false;
        result.reason = "Disposable email address";
        this.emit("onVerified", { email: normalized, valid: false });
        return result;
      }
    }

    // Step 3: MX record check
    if (this.config.checkMx) {
      try {
        result.mxExists = await this.checkMxRecords(domain);
        if (!result.mxExists) {
          result.valid = false;
          result.reason = "No MX records found for domain";
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.emit("onError", { email: normalized, message });
        result.mxExists = false;
        result.valid = false;
        result.reason = `MX lookup failed: ${message}`;
      }
    }

    this.emit("onVerified", { email: normalized, valid: result.valid });
    return result;
  }

  /** Verify multiple email addresses concurrently. */
  async bulkVerify(
    emails: string[],
    concurrency: number = 10
  ): Promise<VerificationResult[]> {
    const results: VerificationResult[] = [];
    const queue = [...emails];

    const worker = async () => {
      while (queue.length > 0) {
        const email = queue.shift();
        if (!email) break;
        const result = await this.verify(email);
        results.push(result);
      }
    };

    const workers = Array.from(
      { length: Math.min(concurrency, emails.length) },
      () => worker()
    );
    await Promise.all(workers);

    // Maintain input order
    const resultMap = new Map(results.map((r) => [r.email, r]));
    return emails.map((email) => resultMap.get(email.trim().toLowerCase())!);
  }

  /** Validate email syntax against RFC 5322 simplified pattern. */
  private isValidSyntax(email: string): boolean {
    // Practical RFC 5322 email regex (not fully compliant but covers 99.9% of real addresses)
    const emailRegex =
      /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

    if (!emailRegex.test(email)) return false;

    // Additional checks
    const [local, domain] = email.split("@");
    if (!local || !domain) return false;
    if (local.length > 64) return false;
    if (domain.length > 253) return false;

    // Domain must have at least one dot
    if (!domain.includes(".")) return false;

    // TLD must be at least 2 characters
    const tld = domain.split(".").pop();
    if (!tld || tld.length < 2) return false;

    // No consecutive dots
    if (email.includes("..")) return false;

    return true;
  }

  /** Check if domain is a known disposable email provider. */
  private isDisposable(domain: string): boolean {
    return DISPOSABLE_DOMAINS.has(domain);
  }

  /** Look up MX records for a domain with timeout. */
  private async checkMxRecords(domain: string): Promise<boolean> {
    return new Promise<boolean>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`MX lookup timed out after ${this.config.timeout}ms`));
      }, this.config.timeout);

      dns
        .resolveMx(domain)
        .then((records) => {
          clearTimeout(timer);
          resolve(records.length > 0);
        })
        .catch((err) => {
          clearTimeout(timer);
          // ENODATA or ENOTFOUND means no MX records
          if (err.code === "ENODATA" || err.code === "ENOTFOUND") {
            // Fall back to checking A records (some domains accept mail without MX)
            dns
              .resolve4(domain)
              .then((addresses) => resolve(addresses.length > 0))
              .catch(() => resolve(false));
          } else {
            reject(err);
          }
        });
    });
  }

  private extractDomain(email: string): string {
    const parts = email.split("@");
    return parts.length > 1 ? parts[1] : "";
  }
}

export default EmailVerify;
