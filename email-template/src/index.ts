// @radzor/email-template — Render email templates with Handlebars-style variable interpolation

export interface EmailTemplateConfig {
  defaultFrom?: string;
  strictMode?: boolean;
}

interface TemplateEntry {
  name: string;
  htmlBody: string;
  textBody?: string;
}

export type EventMap = {
  onRendered: { templateName: string; variableCount: number };
  onError: { code: string; message: string; templateName: string };
};

export type Listener<T> = (event: T) => void;

export class EmailTemplate {
  private config: { defaultFrom?: string; strictMode: boolean };
  private templates: Map<string, TemplateEntry> = new Map();
  private listeners: { [K in keyof EventMap]?: Listener<EventMap[K]>[] } = {};

  constructor(config: EmailTemplateConfig = {}) {
    this.config = {
      defaultFrom: config.defaultFrom,
      strictMode: config.strictMode ?? false,
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

  /** Register a reusable email template. */
  registerTemplate(name: string, htmlBody: string, textBody?: string): void {
    this.templates.set(name, { name, htmlBody, textBody });
  }

  /** List all registered template names. */
  listTemplates(): string[] {
    return Array.from(this.templates.keys());
  }

  /** Render a registered template with the given data context. */
  async render(
    templateName: string,
    data: Record<string, unknown>
  ): Promise<{ html: string; text: string }> {
    const template = this.templates.get(templateName);

    if (!template) {
      const err = {
        code: "TEMPLATE_NOT_FOUND",
        message: `Template "${templateName}" not found. Register it first with registerTemplate().`,
        templateName,
      };
      this.emit("onError", err);
      throw new Error(err.message);
    }

    try {
      const variableNames = this.extractVariableNames(template.htmlBody);
      const html = this.compile(template.htmlBody, data);
      const text = template.textBody
        ? this.compile(template.textBody, data)
        : this.stripHtml(html);

      this.emit("onRendered", {
        templateName,
        variableCount: variableNames.length,
      });

      return { html, text };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.emit("onError", { code: "RENDER_FAILED", message, templateName });
      throw err;
    }
  }

  /** Compile a template string with a data context. Supports {{var}}, {{#if}}, {{#each}}, {{#unless}}. */
  private compile(template: string, data: Record<string, unknown>): string {
    let result = template;

    // Process {{#each items}}...{{/each}} blocks
    result = this.processEachBlocks(result, data);

    // Process {{#if condition}}...{{else}}...{{/if}} blocks
    result = this.processIfBlocks(result, data);

    // Process {{#unless condition}}...{{/unless}} blocks
    result = this.processUnlessBlocks(result, data);

    // Replace {{variable}} and {{object.property}} placeholders
    result = this.interpolateVariables(result, data);

    return result;
  }

  private processEachBlocks(template: string, data: Record<string, unknown>): string {
    const eachRegex = /\{\{#each\s+(\w[\w.]*)\}\}([\s\S]*?)\{\{\/each\}\}/g;

    return template.replace(eachRegex, (_match, key: string, body: string) => {
      const items = this.resolveValue(key, data);
      if (!Array.isArray(items)) return "";

      return items
        .map((item, index) => {
          const itemData: Record<string, unknown> = {
            ...data,
            "@index": index,
            "@first": index === 0,
            "@last": index === items.length - 1,
            this: item,
          };

          if (typeof item === "object" && item !== null) {
            Object.assign(itemData, item as Record<string, unknown>);
          }

          // Recursively compile the body for nested blocks
          let compiled = this.processEachBlocks(body, itemData);
          compiled = this.processIfBlocks(compiled, itemData);
          compiled = this.interpolateVariables(compiled, itemData);
          return compiled;
        })
        .join("");
    });
  }

  private processIfBlocks(template: string, data: Record<string, unknown>): string {
    const ifRegex = /\{\{#if\s+(\w[\w.]*)\}\}([\s\S]*?)\{\{\/if\}\}/g;

    return template.replace(ifRegex, (_match, key: string, body: string) => {
      const value = this.resolveValue(key, data);
      const isTruthy = this.isTruthy(value);

      // Check for {{else}} within the body
      const elseIndex = body.indexOf("{{else}}");
      if (elseIndex !== -1) {
        const ifBody = body.slice(0, elseIndex);
        const elseBody = body.slice(elseIndex + 8);
        return isTruthy ? ifBody : elseBody;
      }

      return isTruthy ? body : "";
    });
  }

  private processUnlessBlocks(template: string, data: Record<string, unknown>): string {
    const unlessRegex = /\{\{#unless\s+(\w[\w.]*)\}\}([\s\S]*?)\{\{\/unless\}\}/g;

    return template.replace(unlessRegex, (_match, key: string, body: string) => {
      const value = this.resolveValue(key, data);
      return this.isTruthy(value) ? "" : body;
    });
  }

  private interpolateVariables(template: string, data: Record<string, unknown>): string {
    // Triple braces: raw (unescaped) output
    let result = template.replace(/\{\{\{(\w[\w.]*)\}\}\}/g, (_match, key: string) => {
      const value = this.resolveValue(key, data);
      if (value === undefined) {
        if (this.config.strictMode) {
          throw new Error(`Missing template variable: "${key}"`);
        }
        return "";
      }
      return String(value);
    });

    // Double braces: HTML-escaped output
    result = result.replace(/\{\{(\w[\w.]*)\}\}/g, (_match, key: string) => {
      const value = this.resolveValue(key, data);
      if (value === undefined) {
        if (this.config.strictMode) {
          throw new Error(`Missing template variable: "${key}"`);
        }
        return "";
      }
      return this.escapeHtml(String(value));
    });

    return result;
  }

  private resolveValue(path: string, data: Record<string, unknown>): unknown {
    if (path === "this") return data["this"];

    const parts = path.split(".");
    let current: unknown = data;

    for (const part of parts) {
      if (current === null || current === undefined) return undefined;
      if (typeof current !== "object") return undefined;
      current = (current as Record<string, unknown>)[part];
    }

    return current;
  }

  private isTruthy(value: unknown): boolean {
    if (value === null || value === undefined || value === false) return false;
    if (value === 0 || value === "") return false;
    if (Array.isArray(value) && value.length === 0) return false;
    return true;
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  private stripHtml(html: string): string {
    return html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n\n")
      .replace(/<\/div>/gi, "\n")
      .replace(/<\/li>/gi, "\n")
      .replace(/<li[^>]*>/gi, "- ")
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  private extractVariableNames(template: string): string[] {
    const vars = new Set<string>();
    const regex = /\{\{(?:#\w+\s+)?(\w[\w.]*)\}\}/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(template)) !== null) {
      vars.add(match[1]);
    }
    return Array.from(vars);
  }
}

export default EmailTemplate;
