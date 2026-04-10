// @radzor/invoice-generator — Generate PDF invoices from structured data

export interface InvoiceGeneratorConfig {
  companyName: string;
  companyAddress?: string;
  currency?: string;
  taxRate?: number;
  invoicePrefix?: string;
}

export interface CustomerInfo {
  name: string;
  email: string;
  address?: string;
}

export interface LineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface InvoiceData {
  invoiceNumber: string;
  date: string;
  customer: CustomerInfo;
  lineItems: LineItem[];
  subtotal: number;
  taxAmount: number;
  total: number;
  currency: string;
  company: { name: string; address?: string };
}

export type EventMap = {
  onGenerated: { invoiceNumber: string; total: number; customerEmail: string };
  onError: { code: string; message: string };
};

export type Listener<T> = (event: T) => void;

export class InvoiceGenerator {
  private config: Required<Omit<InvoiceGeneratorConfig, "companyAddress">> & {
    companyAddress?: string;
  };
  private customer: CustomerInfo | null = null;
  private lineItems: LineItem[] = [];
  private invoiceCounter = 0;
  private listeners: { [K in keyof EventMap]?: Listener<EventMap[K]>[] } = {};

  constructor(config: InvoiceGeneratorConfig) {
    this.config = {
      companyName: config.companyName,
      companyAddress: config.companyAddress,
      currency: config.currency ?? "USD",
      taxRate: config.taxRate ?? 0,
      invoicePrefix: config.invoicePrefix ?? "INV",
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

  /** Set the customer details for the invoice. */
  setCustomer(name: string, email: string, address?: string): void {
    this.customer = { name, email, address };
  }

  /** Add a line item to the current invoice. */
  addLineItem(description: string, quantity: number, unitPrice: number): void {
    this.lineItems.push({
      description,
      quantity,
      unitPrice,
      total: quantity * unitPrice,
    });
  }

  /** Generate the PDF invoice from accumulated line items and customer info. */
  async generate(): Promise<{ pdf: Buffer; data: InvoiceData }> {
    if (!this.customer) {
      const err = { code: "NO_CUSTOMER", message: "Customer must be set before generating an invoice." };
      this.emit("onError", err);
      throw new Error(err.message);
    }

    if (this.lineItems.length === 0) {
      const err = { code: "NO_LINE_ITEMS", message: "At least one line item must be added before generating." };
      this.emit("onError", err);
      throw new Error(err.message);
    }

    try {
      this.invoiceCounter++;
      const invoiceNumber = `${this.config.invoicePrefix}-${String(this.invoiceCounter).padStart(6, "0")}`;
      const subtotal = this.lineItems.reduce((sum, item) => sum + item.total, 0);
      const taxAmount = Math.round(subtotal * (this.config.taxRate / 100) * 100) / 100;
      const total = Math.round((subtotal + taxAmount) * 100) / 100;

      const invoiceData: InvoiceData = {
        invoiceNumber,
        date: new Date().toISOString(),
        customer: { ...this.customer },
        lineItems: [...this.lineItems],
        subtotal,
        taxAmount,
        total,
        currency: this.config.currency,
        company: { name: this.config.companyName, address: this.config.companyAddress },
      };

      const pdf = await this.renderPdf(invoiceData);

      this.emit("onGenerated", {
        invoiceNumber,
        total,
        customerEmail: this.customer.email,
      });

      // Reset line items for next invoice
      this.lineItems = [];
      this.customer = null;

      return { pdf, data: invoiceData };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.emit("onError", { code: "GENERATION_FAILED", message });
      throw err;
    }
  }

  /** Render invoice data to a PDF buffer using pdfkit. */
  private async renderPdf(data: InvoiceData): Promise<Buffer> {
    const PDFDocument = (await import("pdfkit")).default;

    return new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ size: "A4", margin: 50 });
      const chunks: Buffer[] = [];

      doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const pageWidth = doc.page.width - 100; // 50px margins each side
      const currencySymbol = this.getCurrencySymbol(data.currency);

      // Header: Company info
      doc.fontSize(20).font("Helvetica-Bold").text(data.company.name, 50, 50);
      if (data.company.address) {
        doc.fontSize(10).font("Helvetica").text(data.company.address, 50, 75);
      }

      // Invoice title and number
      doc
        .fontSize(28)
        .font("Helvetica-Bold")
        .text("INVOICE", 350, 50, { align: "right", width: pageWidth - 300 });
      doc
        .fontSize(10)
        .font("Helvetica")
        .text(`Invoice #: ${data.invoiceNumber}`, 350, 85, { align: "right", width: pageWidth - 300 });
      doc.text(`Date: ${new Date(data.date).toLocaleDateString()}`, 350, 100, {
        align: "right",
        width: pageWidth - 300,
      });

      // Divider
      doc.moveTo(50, 130).lineTo(50 + pageWidth, 130).stroke();

      // Bill To
      doc.fontSize(12).font("Helvetica-Bold").text("Bill To:", 50, 150);
      doc.fontSize(10).font("Helvetica").text(data.customer.name, 50, 168);
      doc.text(data.customer.email, 50, 183);
      if (data.customer.address) {
        doc.text(data.customer.address, 50, 198);
      }

      // Table header
      const tableTop = 240;
      const colWidths = { desc: 250, qty: 80, price: 100, total: 100 };

      doc.fontSize(10).font("Helvetica-Bold");
      doc.text("Description", 50, tableTop);
      doc.text("Qty", 300, tableTop, { width: colWidths.qty, align: "right" });
      doc.text("Unit Price", 380, tableTop, { width: colWidths.price, align: "right" });
      doc.text("Total", 480, tableTop, { width: colWidths.total, align: "right" });

      doc.moveTo(50, tableTop + 15).lineTo(50 + pageWidth, tableTop + 15).stroke();

      // Table rows
      doc.font("Helvetica");
      let y = tableTop + 25;
      for (const item of data.lineItems) {
        doc.text(item.description, 50, y, { width: colWidths.desc });
        doc.text(String(item.quantity), 300, y, { width: colWidths.qty, align: "right" });
        doc.text(`${currencySymbol}${item.unitPrice.toFixed(2)}`, 380, y, {
          width: colWidths.price,
          align: "right",
        });
        doc.text(`${currencySymbol}${item.total.toFixed(2)}`, 480, y, {
          width: colWidths.total,
          align: "right",
        });
        y += 20;
      }

      // Totals
      doc.moveTo(380, y + 5).lineTo(50 + pageWidth, y + 5).stroke();
      y += 15;

      doc.font("Helvetica");
      doc.text("Subtotal:", 380, y, { width: 100, align: "right" });
      doc.text(`${currencySymbol}${data.subtotal.toFixed(2)}`, 480, y, {
        width: colWidths.total,
        align: "right",
      });
      y += 18;

      if (data.taxAmount > 0) {
        doc.text(`Tax (${this.config.taxRate}%):`, 380, y, { width: 100, align: "right" });
        doc.text(`${currencySymbol}${data.taxAmount.toFixed(2)}`, 480, y, {
          width: colWidths.total,
          align: "right",
        });
        y += 18;
      }

      doc.font("Helvetica-Bold").fontSize(12);
      doc.text("Total:", 380, y, { width: 100, align: "right" });
      doc.text(`${currencySymbol}${data.total.toFixed(2)}`, 480, y, {
        width: colWidths.total,
        align: "right",
      });

      // Footer
      doc
        .fontSize(8)
        .font("Helvetica")
        .text("Generated by @radzor/invoice-generator", 50, doc.page.height - 70, {
          align: "center",
          width: pageWidth,
        });

      doc.end();
    });
  }

  private getCurrencySymbol(code: string): string {
    const symbols: Record<string, string> = {
      USD: "$",
      EUR: "\u20AC",
      GBP: "\u00A3",
      JPY: "\u00A5",
      CAD: "CA$",
      AUD: "A$",
      CHF: "CHF ",
      CNY: "\u00A5",
      INR: "\u20B9",
      BRL: "R$",
    };
    return symbols[code.toUpperCase()] ?? `${code} `;
  }
}

export default InvoiceGenerator;
