// @radzor/screenshot — Browser screenshot capture via Puppeteer
// Requires: npm install puppeteer (includes Chromium download)
// Not suitable for edge/serverless environments.

export type WaitFor = "load" | "networkidle" | "domcontentloaded";
export type ScreenshotFormat = "png" | "jpeg";

export interface Viewport {
  width: number;
  height: number;
}

export interface CaptureOptions {
  viewport?: Viewport;
  fullPage?: boolean;
  format?: ScreenshotFormat;
  quality?: number;
  waitFor?: WaitFor;
}

export interface ScreenshotConfig {
  viewport?: Viewport;
  fullPage?: boolean;
  format?: ScreenshotFormat;
  quality?: number;
  waitFor?: WaitFor;
}

export interface CapturedEvent {
  url: string;
  format: ScreenshotFormat;
  bytes: number;
}

export interface ErrorEvent {
  code: string;
  message: string;
  url?: string;
}

type EventMap = {
  onCaptured: CapturedEvent;
  onError: ErrorEvent;
};

type Listener<T> = (event: T) => void;

const DEFAULT_VIEWPORT: Viewport = { width: 1280, height: 800 };
const WAIT_UNTIL_MAP: Record<WaitFor, string> = {
  load: "load",
  networkidle: "networkidle2",
  domcontentloaded: "domcontentloaded",
};

// Lazily-loaded Puppeteer types
type PuppeteerBrowser = {
  newPage(): Promise<PuppeteerPage>;
  close(): Promise<void>;
};

type PuppeteerPage = {
  setViewport(v: { width: number; height: number }): Promise<void>;
  goto(url: string, opts: { waitUntil: string }): Promise<unknown>;
  setContent(html: string, opts: { waitUntil: string }): Promise<void>;
  screenshot(opts: Record<string, unknown>): Promise<Buffer>;
  $(selector: string): Promise<PuppeteerElement | null>;
  close(): Promise<void>;
};

type PuppeteerElement = {
  boundingBox(): Promise<{ x: number; y: number; width: number; height: number } | null>;
};

export class Screenshot {
  private config: Required<ScreenshotConfig>;
  private listeners: { [K in keyof EventMap]?: Listener<EventMap[K]>[] } = {};
  private browser: PuppeteerBrowser | null = null;
  private launchPromise: Promise<PuppeteerBrowser> | null = null;

  constructor(config: ScreenshotConfig = {}) {
    this.config = {
      viewport: config.viewport ?? DEFAULT_VIEWPORT,
      fullPage: config.fullPage ?? false,
      format: config.format ?? "png",
      quality: config.quality ?? 90,
      waitFor: config.waitFor ?? "networkidle",
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

  /** Capture a screenshot of a URL. Returns a PNG or JPEG buffer. */
  async capture(url: string, options?: CaptureOptions): Promise<Buffer> {
    const opts = this.mergeOptions(options);
    const page = await this.newPage(opts.viewport);

    try {
      await page.goto(url, { waitUntil: WAIT_UNTIL_MAP[opts.waitFor] });
      const buf = await this.takeScreenshot(page, opts);
      this.emit("onCaptured", { url, format: opts.format, bytes: buf.length });
      return buf;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.emit("onError", { code: "CAPTURE_ERROR", message, url });
      throw err;
    } finally {
      await page.close();
    }
  }

  /** Capture a screenshot of a specific DOM element. */
  async captureElement(url: string, selector: string, options?: CaptureOptions): Promise<Buffer> {
    const opts = this.mergeOptions(options);
    const page = await this.newPage(opts.viewport);

    try {
      await page.goto(url, { waitUntil: WAIT_UNTIL_MAP[opts.waitFor] });

      const element = await page.$(selector);
      if (!element) {
        throw new Error(`Element not found: "${selector}"`);
      }

      const box = await element.boundingBox();
      if (!box) {
        throw new Error(`Element "${selector}" has no bounding box (may be hidden).`);
      }

      const screenshotOpts: Record<string, unknown> = {
        type: opts.format,
        clip: { x: box.x, y: box.y, width: box.width, height: box.height },
      };
      if (opts.format === "jpeg") screenshotOpts.quality = opts.quality;

      const buf = await page.screenshot(screenshotOpts) as Buffer;
      this.emit("onCaptured", { url: `${url}#${selector}`, format: opts.format, bytes: buf.length });
      return buf;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.emit("onError", { code: "CAPTURE_ELEMENT_ERROR", message, url });
      throw err;
    } finally {
      await page.close();
    }
  }

  /** Render raw HTML and capture a screenshot. */
  async captureHtml(html: string, options?: CaptureOptions): Promise<Buffer> {
    const opts = this.mergeOptions(options);
    const page = await this.newPage(opts.viewport);

    try {
      await page.setContent(html, { waitUntil: WAIT_UNTIL_MAP[opts.waitFor] });
      const buf = await this.takeScreenshot(page, opts);
      this.emit("onCaptured", { url: "html://inline", format: opts.format, bytes: buf.length });
      return buf;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.emit("onError", { code: "CAPTURE_HTML_ERROR", message });
      throw err;
    } finally {
      await page.close();
    }
  }

  /** Close the shared browser instance. Call on shutdown to free resources. */
  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.launchPromise = null;
    }
  }

  // ─── Private Helpers ─────────────────────────────────────────────────────────

  private mergeOptions(options?: CaptureOptions): Required<CaptureOptions> {
    return {
      viewport: options?.viewport ?? this.config.viewport,
      fullPage: options?.fullPage ?? this.config.fullPage,
      format: options?.format ?? this.config.format,
      quality: options?.quality ?? this.config.quality,
      waitFor: options?.waitFor ?? this.config.waitFor,
    };
  }

  private async getBrowser(): Promise<PuppeteerBrowser> {
    if (this.browser) return this.browser;
    if (this.launchPromise) return this.launchPromise;

    this.launchPromise = (async () => {
      let puppeteer: { launch: (opts: Record<string, unknown>) => Promise<PuppeteerBrowser> };
      try {
        puppeteer = await import("puppeteer") as typeof puppeteer;
      } catch {
        throw new Error(
          "Puppeteer is not installed. Run: npm install puppeteer\n" +
          "Note: @radzor/screenshot is not compatible with edge or serverless environments."
        );
      }

      const browser = await puppeteer.launch({
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
        ],
      });

      this.browser = browser;
      this.launchPromise = null;
      return browser;
    })();

    return this.launchPromise;
  }

  private async newPage(viewport: Viewport): Promise<PuppeteerPage> {
    const browser = await this.getBrowser();
    const page = await browser.newPage();
    await page.setViewport({ width: viewport.width, height: viewport.height });
    return page;
  }

  private async takeScreenshot(
    page: PuppeteerPage,
    opts: Required<CaptureOptions>
  ): Promise<Buffer> {
    const screenshotOpts: Record<string, unknown> = {
      type: opts.format,
      fullPage: opts.fullPage,
    };
    if (opts.format === "jpeg") screenshotOpts.quality = opts.quality;
    return (await page.screenshot(screenshotOpts)) as Buffer;
  }
}

export default Screenshot;
