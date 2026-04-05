import sharp from "sharp";

export interface ImageTransformConfig {
  quality?: number;
  defaultFormat?: "jpeg" | "png" | "webp" | "avif";
  stripMetadata?: boolean;
  progressive?: boolean;
}

export interface ImageMetadata {
  width: number;
  height: number;
  format: string;
  size: number;
  hasAlpha?: boolean;
  space?: string;
}

type FitOption = "cover" | "contain" | "fill" | "inside" | "outside";
type GravityOption =
  | "southeast"
  | "south"
  | "southwest"
  | "east"
  | "center"
  | "west"
  | "northeast"
  | "north"
  | "northwest";

type EventMap = {
  onTransformed: { format: string; width: number; height: number; sizeBytes: number };
  onError: { code: string; message: string; operation: string };
};

type Listener<T> = (payload: T) => void;

export class ImageTransform {
  private config: Required<ImageTransformConfig>;
  private listeners: Map<string, Listener<unknown>[]> = new Map();

  constructor(config: ImageTransformConfig = {}) {
    this.config = {
      quality: config.quality ?? 80,
      defaultFormat: config.defaultFormat ?? "webp",
      stripMetadata: config.stripMetadata ?? true,
      progressive: config.progressive ?? true,
    };
  }

  on<K extends keyof EventMap>(event: K, listener: Listener<EventMap[K]>): void {
    const listeners = this.listeners.get(event) ?? [];
    listeners.push(listener as Listener<unknown>);
    this.listeners.set(event, listeners);
  }

  off<K extends keyof EventMap>(event: K, listener: Listener<EventMap[K]>): void {
    const listeners = this.listeners.get(event) ?? [];
    this.listeners.set(
      event,
      listeners.filter((l) => l !== (listener as Listener<unknown>))
    );
  }

  private emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
    const listeners = this.listeners.get(event) ?? [];
    for (const listener of listeners) {
      listener(payload as unknown);
    }
  }

  private applyFormat(
    pipeline: sharp.Sharp,
    format: "jpeg" | "png" | "webp" | "avif",
    quality?: number
  ): sharp.Sharp {
    const q = quality ?? this.config.quality;
    switch (format) {
      case "jpeg":
        return pipeline.jpeg({ quality: q, progressive: this.config.progressive });
      case "png":
        return pipeline.png({ progressive: this.config.progressive });
      case "webp":
        return pipeline.webp({ quality: q });
      case "avif":
        return pipeline.avif({ quality: q });
    }
  }

  private buildPipeline(input: Buffer | string): sharp.Sharp {
    const pipeline = sharp(input);
    if (this.config.stripMetadata) {
      pipeline.withMetadata(false);
    }
    return pipeline;
  }

  private async finalize(
    pipeline: sharp.Sharp,
    operation: string,
    format: "jpeg" | "png" | "webp" | "avif",
    quality?: number
  ): Promise<Buffer> {
    try {
      const withFormat = this.applyFormat(pipeline, format, quality);
      const { data, info } = await withFormat.toBuffer({ resolveWithObject: true });

      this.emit("onTransformed", {
        format: info.format,
        width: info.width,
        height: info.height,
        sizeBytes: info.size,
      });

      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.emit("onError", { code: "TRANSFORM_ERROR", message, operation });
      throw err;
    }
  }

  async resize(
    input: Buffer | string,
    width?: number,
    height?: number,
    fit: FitOption = "inside"
  ): Promise<Buffer> {
    const pipeline = this.buildPipeline(input).resize(width, height, { fit });
    return this.finalize(pipeline, "resize", this.config.defaultFormat);
  }

  async crop(
    input: Buffer | string,
    width: number,
    height: number,
    left = 0,
    top = 0
  ): Promise<Buffer> {
    const pipeline = this.buildPipeline(input).extract({ left, top, width, height });
    return this.finalize(pipeline, "crop", this.config.defaultFormat);
  }

  async convert(
    input: Buffer | string,
    format: "jpeg" | "png" | "webp" | "avif",
    quality?: number
  ): Promise<Buffer> {
    const pipeline = this.buildPipeline(input);
    return this.finalize(pipeline, "convert", format, quality);
  }

  async watermark(
    input: Buffer | string,
    overlay: Buffer | string,
    gravity: GravityOption = "southeast"
  ): Promise<Buffer> {
    const pipeline = this.buildPipeline(input).composite([
      { input: overlay, gravity },
    ]);
    return this.finalize(pipeline, "watermark", this.config.defaultFormat);
  }

  async getMetadata(input: Buffer | string): Promise<ImageMetadata> {
    try {
      const meta = await sharp(input).metadata();
      return {
        width: meta.width ?? 0,
        height: meta.height ?? 0,
        format: meta.format ?? "unknown",
        size: meta.size ?? 0,
        hasAlpha: meta.hasAlpha,
        space: meta.space,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.emit("onError", { code: "METADATA_ERROR", message, operation: "getMetadata" });
      throw err;
    }
  }
}
