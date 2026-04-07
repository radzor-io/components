// @radzor/markdown-render — Zero-dependency Markdown renderer with frontmatter support

export interface MarkdownRenderConfig {
  sanitize?: boolean;
  syntaxHighlight?: boolean;
  breaks?: boolean;
  linkify?: boolean;
  allowedTags?: string[];
}

export interface RenderResult {
  html: string;
  frontmatter: Record<string, unknown>;
}

export interface FrontmatterResult {
  data: Record<string, unknown>;
  content: string;
}

export interface RenderedEvent {
  html: string;
  frontmatterKeys: string[];
}

export interface ErrorEvent {
  code: string;
  message: string;
}

export type EventMap = {
  onRendered: RenderedEvent;
  onError: ErrorEvent;
};

export type Listener<T> = (event: T) => void;

const DEFAULT_ALLOWED_TAGS = [
  "h1","h2","h3","h4","h5","h6","p","br","hr","strong","em","del","code","pre",
  "blockquote","ul","ol","li","a","img","table","thead","tbody","tr","th","td",
  "span","div","details","summary",
];

export class MarkdownRenderer {
  private config: Required<MarkdownRenderConfig>;
  private listeners: { [K in keyof EventMap]?: Listener<EventMap[K]>[] } = {};

  constructor(config: MarkdownRenderConfig = {}) {
    this.config = {
      sanitize: config.sanitize !== undefined ? config.sanitize : true,
      syntaxHighlight: config.syntaxHighlight !== undefined ? config.syntaxHighlight : true,
      breaks: config.breaks !== undefined ? config.breaks : false,
      linkify: config.linkify !== undefined ? config.linkify : true,
      allowedTags: config.allowedTags ?? DEFAULT_ALLOWED_TAGS,
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

  /** Parse and render Markdown to HTML, extracting frontmatter. */
  async render(markdown: string, options?: Partial<MarkdownRenderConfig>): Promise<RenderResult> {
    try {
      const cfg = options ? { ...this.config, ...options } : this.config;
      const { data: frontmatter, content } = this.extractFrontmatter(markdown);
      let html = this.convertToHtml(content, cfg);
      if (cfg.sanitize) {
        html = this.sanitizeHtml(html, cfg.allowedTags);
      }
      const result: RenderResult = { html, frontmatter };
      this.emit("onRendered", { html, frontmatterKeys: Object.keys(frontmatter) });
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.emit("onError", { code: "RENDER_ERROR", message });
      throw err;
    }
  }

  /** Strip all Markdown and HTML, returning plain text. */
  toPlainText(markdown: string): string {
    const { content } = this.extractFrontmatter(markdown);
    // Remove code blocks first
    let text = content.replace(/```[\s\S]*?```/g, "");
    text = text.replace(/`[^`]+`/g, (m) => m.slice(1, -1));
    // Remove headings markers
    text = text.replace(/^#{1,6}\s+/gm, "");
    // Remove bold/italic/strikethrough
    text = text.replace(/(\*{1,3}|_{1,3}|~~)(.*?)\1/g, "$2");
    // Remove links, keep text
    text = text.replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1");
    text = text.replace(/!?\[([^\]]*)\]\[[^\]]*\]/g, "$1");
    // Remove reference definitions
    text = text.replace(/^\[.*?\]:\s+.*$/gm, "");
    // Remove blockquote markers
    text = text.replace(/^>\s?/gm, "");
    // Remove horizontal rules
    text = text.replace(/^[-*_]{3,}\s*$/gm, "");
    // Remove list markers
    text = text.replace(/^[\s]*[-*+]\s+/gm, "");
    text = text.replace(/^[\s]*\d+\.\s+/gm, "");
    // Remove table syntax
    text = text.replace(/\|/g, " ");
    text = text.replace(/^[\s\-:|]+$/gm, "");
    // Strip remaining HTML tags
    text = text.replace(/<[^>]+>/g, "");
    // Collapse multiple blank lines
    text = text.replace(/\n{3,}/g, "\n\n").trim();
    return text;
  }

  /** Extract YAML frontmatter between leading --- delimiters. */
  extractFrontmatter(markdown: string): FrontmatterResult {
    const trimmed = markdown.trimStart();
    if (!trimmed.startsWith("---")) {
      return { data: {}, content: markdown };
    }
    const rest = trimmed.slice(3);
    const end = rest.indexOf("\n---");
    if (end === -1) {
      return { data: {}, content: markdown };
    }
    const yamlBlock = rest.slice(0, end).trim();
    const content = rest.slice(end + 4).replace(/^\n/, "");
    const data = this.parseYaml(yamlBlock);
    return { data, content };
  }

  // ─── Private: YAML Parser ────────────────────────────────────────────────────

  private parseYaml(yaml: string): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    const lines = yaml.split("\n");
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];
      const match = line.match(/^([a-zA-Z_][\w-]*):\s*(.*)?$/);
      if (match) {
        const key = match[1];
        const rawValue = (match[2] ?? "").trim();

        if (rawValue === "" || rawValue === "|" || rawValue === ">") {
          // Multiline value: collect indented lines
          const block: string[] = [];
          i++;
          while (i < lines.length && /^\s+/.test(lines[i])) {
            block.push(lines[i].trim());
            i++;
          }
          result[key] = block.join(rawValue === ">" ? " " : "\n");
          continue;
        }

        result[key] = this.parseYamlValue(rawValue);
      }
      i++;
    }

    return result;
  }

  private parseYamlValue(raw: string): unknown {
    if (raw === "true") return true;
    if (raw === "false") return false;
    if (raw === "null" || raw === "~") return null;
    if (/^-?\d+$/.test(raw)) return parseInt(raw, 10);
    if (/^-?\d+\.\d+$/.test(raw)) return parseFloat(raw);
    if (raw.startsWith("[") && raw.endsWith("]")) {
      return raw.slice(1, -1).split(",").map((v) => this.parseYamlValue(v.trim()));
    }
    // Strip surrounding quotes
    if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
      return raw.slice(1, -1);
    }
    return raw;
  }

  // ─── Private: Markdown → HTML ────────────────────────────────────────────────

  private convertToHtml(markdown: string, cfg: Required<MarkdownRenderConfig>): string {
    let text = markdown;

    // Normalize line endings
    text = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

    // Protect code blocks (fenced)
    const codeBlocks: string[] = [];
    text = text.replace(/```(\w*)\n?([\s\S]*?)```/g, (_m, lang, code) => {
      const cls = lang ? ` class="language-${this.escapeAttr(lang)}"` : "";
      const highlighted = `<pre><code${cls}>${this.escapeHtml(code.replace(/\n$/, ""))}</code></pre>`;
      codeBlocks.push(highlighted);
      return `\x00CODE${codeBlocks.length - 1}\x00`;
    });

    // Protect inline code
    const inlineCodes: string[] = [];
    text = text.replace(/`([^`]+)`/g, (_m, code) => {
      inlineCodes.push(`<code>${this.escapeHtml(code)}</code>`);
      return `\x00INLINE${inlineCodes.length - 1}\x00`;
    });

    // HTML entities for remaining raw <> outside code
    // (will be re-escaped in sanitize if needed)

    // Tables
    text = this.parseTables(text);

    // Horizontal rules
    text = text.replace(/^([-*_]){3,}\s*$/gm, "<hr>");

    // Headings
    text = text.replace(/^(#{1,6})\s+(.+)$/gm, (_m, hashes, content) => {
      const level = hashes.length;
      return `<h${level}>${content.trim()}</h${level}>`;
    });

    // Blockquotes
    text = this.parseBlockquotes(text);

    // Lists
    text = this.parseLists(text);

    // Bold, italic, strikethrough (order matters)
    text = text.replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>");
    text = text.replace(/___(.+?)___/g, "<strong><em>$1</em></strong>");
    text = text.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    text = text.replace(/__(.+?)__/g, "<strong>$1</strong>");
    text = text.replace(/\*(.+?)\*/g, "<em>$1</em>");
    text = text.replace(/_(.+?)_/g, "<em>$1</em>");
    text = text.replace(/~~(.+?)~~/g, "<del>$1</del>");

    // Images before links
    text = text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_m, alt, src) => {
      const parts = src.split(/\s+"/, 2);
      const href = parts[0].trim();
      const title = parts[1] ? ` title="${this.escapeAttr(parts[1].slice(0, -1))}"` : "";
      return `<img src="${this.escapeAttr(href)}" alt="${this.escapeAttr(alt)}"${title}>`;
    });

    // Links
    text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, label, href) => {
      const parts = href.split(/\s+"/, 2);
      const url = parts[0].trim();
      const title = parts[1] ? ` title="${this.escapeAttr(parts[1].slice(0, -1))}"` : "";
      return `<a href="${this.escapeAttr(url)}"${title}>${label}</a>`;
    });

    // Linkify plain URLs
    if (cfg.linkify) {
      text = text.replace(/(?<![="'])(https?:\/\/[^\s<>"']+)/g, '<a href="$1">$1</a>');
    }

    // Paragraphs and line breaks
    text = this.parseParagraphs(text, cfg.breaks);

    // Restore code blocks and inline codes
    text = text.replace(/\x00CODE(\d+)\x00/g, (_m, idx) => codeBlocks[parseInt(idx, 10)]);
    text = text.replace(/\x00INLINE(\d+)\x00/g, (_m, idx) => inlineCodes[parseInt(idx, 10)]);

    return text.trim();
  }

  private parseTables(text: string): string {
    const tableRegex = /^(\|.+\|\n)((?:\|[-: ]+)+\|\n)((?:\|.+\|\n?)*)/gm;
    return text.replace(tableRegex, (_m, header, _sep, body) => {
      const parseRow = (row: string, tag: "th" | "td") => {
        const cells = row.replace(/^\||\|$/g, "").split("|");
        return `<tr>${cells.map((c) => `<${tag}>${c.trim()}</${tag}>`).join("")}</tr>`;
      };
      const thead = `<thead>${parseRow(header.trim(), "th")}</thead>`;
      const rows = body.trim().split("\n").filter(Boolean).map((r) => parseRow(r, "td"));
      const tbody = rows.length ? `<tbody>${rows.join("")}</tbody>` : "";
      return `<table>${thead}${tbody}</table>\n`;
    });
  }

  private parseBlockquotes(text: string): string {
    return text.replace(/(^>.*\n?)+/gm, (block) => {
      const inner = block.replace(/^>\s?/gm, "");
      return `<blockquote>${inner.trim()}</blockquote>\n`;
    });
  }

  private parseLists(text: string): string {
    // Unordered lists
    text = text.replace(/(^[ \t]*[-*+] .+\n?)+/gm, (block) => {
      const items = block.trim().split(/\n/).map((line) => {
        const content = line.replace(/^[ \t]*[-*+] /, "");
        return `<li>${content}</li>`;
      });
      return `<ul>${items.join("")}</ul>\n`;
    });
    // Ordered lists
    text = text.replace(/(^[ \t]*\d+\. .+\n?)+/gm, (block) => {
      const items = block.trim().split(/\n/).map((line) => {
        const content = line.replace(/^[ \t]*\d+\. /, "");
        return `<li>${content}</li>`;
      });
      return `<ol>${items.join("")}</ol>\n`;
    });
    return text;
  }

  private parseParagraphs(text: string, breaks: boolean): string {
    const blocks = text.split(/\n{2,}/);
    return blocks
      .map((block) => {
        block = block.trim();
        if (!block) return "";
        // Already block-level elements
        if (/^<(h[1-6]|ul|ol|li|blockquote|pre|table|hr|div|p)[\s>]/i.test(block)) return block;
        if (/^<\/(h[1-6]|ul|ol|li|blockquote|pre|table|hr|div|p)>/i.test(block)) return block;
        if (block.startsWith("\x00CODE")) return block;
        // Wrap in paragraph
        if (breaks) {
          block = block.replace(/\n/g, "<br>\n");
        }
        return `<p>${block}</p>`;
      })
      .join("\n");
  }

  // ─── Private: Sanitizer ──────────────────────────────────────────────────────

  private sanitizeHtml(html: string, allowedTags: string[]): string {
    // Remove script and style blocks entirely
    html = html.replace(/<script[\s\S]*?<\/script>/gi, "");
    html = html.replace(/<style[\s\S]*?<\/style>/gi, "");

    // Remove tags not in allowedTags and strip dangerous attributes
    html = html.replace(/<(\/?)([\w-]+)([^>]*)>/g, (_m, slash, tag, attrs) => {
      const lcTag = tag.toLowerCase();
      if (!allowedTags.includes(lcTag)) return "";
      // Strip event handlers and dangerous attributes
      const safeAttrs = attrs
        .replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, "")
        .replace(/\s+javascript:[^\s>]*/gi, "")
        .replace(/\s+data:[^\s>]*/gi, "")
        .replace(/\s+href\s*=\s*(?:"javascript:[^"]*"|'javascript:[^']*')/gi, "");
      return `<${slash}${lcTag}${safeAttrs}>`;
    });

    return html;
  }

  // ─── Utilities ────────────────────────────────────────────────────────────────

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  private escapeAttr(str: string): string {
    return str.replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
}

export default MarkdownRenderer;
