// @radzor/pdf-generate — PDF generation from HTML

export interface PdfGenerateConfig {
  pageSize?: "A4" | "Letter" | "Legal";
  margin?: string;
  landscape?: boolean;
}

export interface PdfOptions {
  pageSize?: "A4" | "Letter" | "Legal";
  margin?: string;
  landscape?: boolean;
  headerHtml?: string;
  footerHtml?: string;
}

export type EventMap = {
  onGenerated: { pages: number; size: number };
  onError: { code: string; message: string };
};

const PAGE_SIZES: Record<string, { width: number; height: number }> = {
  A4: { width: 595, height: 842 },
  Letter: { width: 612, height: 792 },
  Legal: { width: 612, height: 1008 },
};

export class PdfGenerate {
  private config: Required<PdfGenerateConfig>;
  private listeners: Map<string, Function[]> = new Map();

  constructor(config?: PdfGenerateConfig) {
    this.config = {
      pageSize: config?.pageSize ?? "A4",
      margin: config?.margin ?? "20mm",
      landscape: config?.landscape ?? false,
    };
  }

  on<K extends keyof EventMap>(event: K, handler: (payload: EventMap[K]) => void): void {
    const handlers = this.listeners.get(event) ?? [];
    handlers.push(handler as Function);
    this.listeners.set(event, handlers);
  }

  off<K extends keyof EventMap>(event: K, handler: (payload: EventMap[K]) => void): void {
    const handlers = this.listeners.get(event) ?? [];
    this.listeners.set(event, handlers.filter((h) => h !== handler));
  }

  private emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
    for (const handler of this.listeners.get(event) ?? []) handler(payload);
  }

  async fromHtml(html: string, options?: PdfOptions): Promise<Buffer> {
    try {
      const pageSize = options?.pageSize ?? this.config.pageSize;
      const landscape = options?.landscape ?? this.config.landscape;
      const dims = PAGE_SIZES[pageSize];
      const width = landscape ? dims.height : dims.width;
      const height = landscape ? dims.width : dims.height;

      // Extract text content from HTML for basic PDF generation
      const textContent = this.stripHtml(html);
      const lines = this.wrapText(textContent, 80);

      const pdfBytes = this.buildPdf(lines, width, height);
      const buffer = Buffer.from(pdfBytes);

      const pages = Math.max(1, Math.ceil(lines.length / 50));
      this.emit("onGenerated", { pages, size: buffer.length });

      return buffer;
    } catch (err: any) {
      this.emit("onError", { code: "GENERATION_FAILED", message: err.message });
      throw err;
    }
  }

  async fromTemplate(template: string, data: Record<string, any>, options?: PdfOptions): Promise<Buffer> {
    let html = template;
    for (const [key, value] of Object.entries(data)) {
      html = html.replace(new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, "g"), String(value));
    }
    return this.fromHtml(html, options);
  }

  async toFile(html: string, outputPath: string, options?: PdfOptions): Promise<void> {
    const buffer = await this.fromHtml(html, options);
    const fs = await import("fs");
    fs.writeFileSync(outputPath, buffer);
  }

  // ─── PDF Builder ─────────────────────────────────────────

  private buildPdf(lines: string[], pageWidth: number, pageHeight: number): Uint8Array {
    const margin = 56; // ~20mm
    const fontSize = 10;
    const lineHeight = 14;
    const usableHeight = pageHeight - margin * 2;
    const linesPerPage = Math.floor(usableHeight / lineHeight);

    const pageGroups: string[][] = [];
    for (let i = 0; i < lines.length; i += linesPerPage) {
      pageGroups.push(lines.slice(i, i + linesPerPage));
    }
    if (pageGroups.length === 0) pageGroups.push([""]);

    const objects: string[] = [];
    let objectId = 0;

    const addObj = (content: string): number => {
      objectId++;
      objects.push(content);
      return objectId;
    };

    // Object 1: Catalog
    addObj("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj");

    // Object 2: Pages (placeholder, will be replaced)
    const pagesObjId = addObj("");

    // Build pages
    const pageObjIds: number[] = [];
    for (const pageLines of pageGroups) {
      // Content stream
      let stream = `BT\n/F1 ${fontSize} Tf\n`;
      let y = pageHeight - margin;
      for (const line of pageLines) {
        const escaped = line.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
        stream += `${margin} ${y} Td\n(${escaped}) Tj\n0 ${-lineHeight} Td\n`;
        y -= lineHeight;
      }
      stream += "ET";

      const streamObjId = addObj(
        `${objectId + 1} 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj`
      );

      // Page object
      const pageObjId = addObj(
        `${objectId + 1} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Contents ${streamObjId} 0 R /Resources << /Font << /F1 ${objectId + 2} 0 R >> >> >>\nendobj`
      );
      pageObjIds.push(pageObjId);

      // Rebuild objects with correct IDs
      objects[streamObjId - 1] = `${streamObjId} 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj`;
      objects[pageObjId - 1] = `${pageObjId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Contents ${streamObjId} 0 R /Resources << /Font << /F1 ${objectId + 1} 0 R >> >> >>\nendobj`;
    }

    // Font object
    const fontObjId = addObj(
      `${objectId + 1} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj`
    );

    // Fix font references in page objects
    for (let i = 0; i < pageObjIds.length; i++) {
      const pid = pageObjIds[i];
      objects[pid - 1] = objects[pid - 1].replace(/\/F1 \d+ 0 R/g, `/F1 ${fontObjId} 0 R`);
    }

    // Update Pages object
    const kids = pageObjIds.map((id) => `${id} 0 R`).join(" ");
    objects[pagesObjId - 1] = `2 0 obj\n<< /Type /Pages /Kids [${kids}] /Count ${pageObjIds.length} >>\nendobj`;

    // Build PDF
    let pdf = "%PDF-1.4\n";
    const offsets: number[] = [];
    for (const obj of objects) {
      offsets.push(pdf.length);
      pdf += obj + "\n";
    }

    const xrefOffset = pdf.length;
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (const offset of offsets) {
      pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
    }

    pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

    return new TextEncoder().encode(pdf);
  }

  private stripHtml(html: string): string {
    return html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n\n")
      .replace(/<\/div>/gi, "\n")
      .replace(/<\/h[1-6]>/gi, "\n\n")
      .replace(/<\/li>/gi, "\n")
      .replace(/<li[^>]*>/gi, "  • ")
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

  private wrapText(text: string, maxChars: number): string[] {
    const result: string[] = [];
    for (const paragraph of text.split("\n")) {
      if (paragraph.length <= maxChars) {
        result.push(paragraph);
        continue;
      }
      const words = paragraph.split(" ");
      let line = "";
      for (const word of words) {
        if ((line + " " + word).trim().length > maxChars) {
          if (line) result.push(line);
          line = word;
        } else {
          line = (line + " " + word).trim();
        }
      }
      if (line) result.push(line);
    }
    return result;
  }
}
