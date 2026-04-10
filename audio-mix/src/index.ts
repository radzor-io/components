// @radzor/audio-mix — Mix, trim, and concatenate audio tracks

import { spawn, execFile } from "node:child_process";
import { stat, writeFile, unlink } from "node:fs/promises";
import { join, dirname } from "node:path";

export interface TrackInput {
  path: string;
  volume?: number;
  startTime?: number;
  endTime?: number;
  delay?: number;
}

export interface MixOptions {
  format?: string;
  sampleRate?: number;
  channels?: number;
  bitrate?: string;
}

export interface MixResult {
  outputPath: string;
  duration: number;
  format: string;
  size: number;
}

export interface AudioMetadata {
  duration: number;
  format: string;
  codec: string;
  sampleRate: number;
  channels: number;
  bitrate: number;
  size: number;
}

export interface AudioMixConfig {
  ffmpegPath?: string;
  ffprobePath?: string;
  outputDir?: string;
}

export type EventMap = {
  onMixComplete: { outputPath: string; duration: number; trackCount: number };
};

type Listener<T> = (event: T) => void;

export class AudioMix {
  private config: Required<AudioMixConfig>;
  private listeners: { [K in keyof EventMap]?: Listener<EventMap[K]>[] } = {};

  constructor(config: AudioMixConfig = {}) {
    this.config = {
      ffmpegPath: config.ffmpegPath ?? "ffmpeg",
      ffprobePath: config.ffprobePath ?? "ffprobe",
      outputDir: config.outputDir ?? "",
    };
  }

  on<K extends keyof EventMap>(event: K, listener: Listener<EventMap[K]>): void {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event]!.push(listener);
  }

  off<K extends keyof EventMap>(event: K, listener: Listener<EventMap[K]>): void {
    const list = this.listeners[event];
    if (list) this.listeners[event] = list.filter((l) => l !== listener) as typeof list;
  }

  private emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
    const list = this.listeners[event];
    if (list) list.forEach((l) => l(payload));
  }

  private runProbe(inputPath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      execFile(
        this.config.ffprobePath,
        ["-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", inputPath],
        { maxBuffer: 10 * 1024 * 1024 },
        (error, stdout, stderr) => {
          if (error) return reject(new Error(`ffprobe failed: ${stderr || error.message}`));
          resolve(stdout);
        },
      );
    });
  }

  private runFfmpeg(args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const proc = spawn(this.config.ffmpegPath, args, { stdio: ["ignore", "pipe", "pipe"] });
      let stderrData = "";

      proc.stderr.on("data", (chunk: Buffer) => { stderrData += chunk.toString(); });

      proc.on("close", (code) => {
        if (code !== 0) {
          const lastLine = stderrData.split("\n").filter(Boolean).pop() ?? `FFmpeg exited with code ${code}`;
          return reject(new Error(lastLine));
        }
        resolve();
      });

      proc.on("error", reject);
    });
  }

  private async buildResult(outputPath: string): Promise<MixResult> {
    const [fileStat, meta] = await Promise.all([stat(outputPath), this.getMetadata(outputPath)]);
    return {
      outputPath,
      duration: meta.duration,
      format: meta.format,
      size: fileStat.size,
    };
  }

  async getMetadata(inputPath: string): Promise<AudioMetadata> {
    const raw = await this.runProbe(inputPath);
    const data = JSON.parse(raw);

    const audioStream = data.streams?.find((s: Record<string, string>) => s.codec_type === "audio");
    const format = data.format ?? {};

    return {
      duration: parseFloat(format.duration ?? "0"),
      format: format.format_name ?? "unknown",
      codec: audioStream?.codec_name ?? "unknown",
      sampleRate: parseInt(audioStream?.sample_rate ?? "0", 10),
      channels: parseInt(audioStream?.channels ?? "0", 10),
      bitrate: parseInt(format.bit_rate ?? "0", 10),
      size: parseInt(format.size ?? "0", 10),
    };
  }

  async mix(tracks: TrackInput[], outputPath: string, options: MixOptions = {}): Promise<MixResult> {
    if (tracks.length === 0) throw new Error("At least one track is required");

    const args: string[] = [];
    const filterParts: string[] = [];

    // Add inputs
    for (let i = 0; i < tracks.length; i++) {
      const track = tracks[i];
      if (track.startTime !== undefined) args.push("-ss", String(track.startTime));
      if (track.endTime !== undefined) args.push("-to", String(track.endTime));
      args.push("-i", track.path);
    }

    // Build filter complex
    for (let i = 0; i < tracks.length; i++) {
      const track = tracks[i];
      let label = `[${i}:a]`;
      const filters: string[] = [];

      if (track.volume !== undefined && track.volume !== 1) {
        filters.push(`volume=${track.volume}`);
      }
      if (track.delay !== undefined && track.delay > 0) {
        filters.push(`adelay=${track.delay}|${track.delay}`);
      }

      if (filters.length > 0) {
        const outLabel = `[t${i}]`;
        filterParts.push(`${label}${filters.join(",")}${outLabel}`);
        label = outLabel;
      }

      filterParts.push(`${label}`);
    }

    // Amix filter for merging
    const inputLabels = tracks.map((_, i) => {
      const hasFilters = (tracks[i].volume !== undefined && tracks[i].volume !== 1) ||
        (tracks[i].delay !== undefined && tracks[i].delay! > 0);
      return hasFilters ? `[t${i}]` : `[${i}:a]`;
    });

    const filterStr = filterParts
      .filter((p) => p.includes("volume") || p.includes("adelay"))
      .join(";");

    if (tracks.length === 1) {
      const singleFilters = [];
      if (tracks[0].volume !== undefined && tracks[0].volume !== 1) {
        singleFilters.push(`volume=${tracks[0].volume}`);
      }
      if (singleFilters.length > 0) {
        args.push("-af", singleFilters.join(","));
      }
    } else {
      const amix = `${inputLabels.join("")}amix=inputs=${tracks.length}:duration=longest[out]`;
      const fullFilter = filterStr ? `${filterStr};${amix}` : amix;
      args.push("-filter_complex", fullFilter, "-map", "[out]");
    }

    if (options.sampleRate) args.push("-ar", String(options.sampleRate));
    if (options.channels) args.push("-ac", String(options.channels));
    if (options.bitrate) args.push("-b:a", options.bitrate);

    args.push("-y", outputPath);
    await this.runFfmpeg(args);

    const result = await this.buildResult(outputPath);
    this.emit("onMixComplete", {
      outputPath,
      duration: result.duration,
      trackCount: tracks.length,
    });
    return result;
  }

  async trim(inputPath: string, outputPath: string, startTime: number, endTime?: number): Promise<MixResult> {
    const args: string[] = ["-i", inputPath, "-ss", String(startTime)];
    if (endTime !== undefined) args.push("-to", String(endTime));
    args.push("-c", "copy", "-y", outputPath);

    await this.runFfmpeg(args);
    const result = await this.buildResult(outputPath);
    this.emit("onMixComplete", { outputPath, duration: result.duration, trackCount: 1 });
    return result;
  }

  async concatenate(inputPaths: string[], outputPath: string): Promise<MixResult> {
    if (inputPaths.length === 0) throw new Error("At least one input path is required");

    // Create a concat list file
    const listPath = join(dirname(outputPath), `.concat-${Date.now()}.txt`);
    const listContent = inputPaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n");
    await writeFile(listPath, listContent, "utf-8");

    try {
      const args = ["-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", "-y", outputPath];
      await this.runFfmpeg(args);

      const result = await this.buildResult(outputPath);
      this.emit("onMixComplete", {
        outputPath,
        duration: result.duration,
        trackCount: inputPaths.length,
      });
      return result;
    } finally {
      await unlink(listPath).catch(() => {});
    }
  }

  async adjustVolume(inputPath: string, outputPath: string, volume: number): Promise<MixResult> {
    const args = ["-i", inputPath, "-af", `volume=${volume}`, "-y", outputPath];
    await this.runFfmpeg(args);

    const result = await this.buildResult(outputPath);
    this.emit("onMixComplete", { outputPath, duration: result.duration, trackCount: 1 });
    return result;
  }
}

export default AudioMix;
