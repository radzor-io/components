// @radzor/video-transcode — Transcode video files between formats using FFmpeg

import { spawn, execFile } from "node:child_process";
import { stat } from "node:fs/promises";

export interface TranscodeOptions {
  codec?: string;
  audioCodec?: string;
  resolution?: string;
  bitrate?: string;
  audioBitrate?: string;
  fps?: number;
  preset?: "ultrafast" | "superfast" | "veryfast" | "faster" | "fast" | "medium" | "slow" | "slower" | "veryslow";
  extraArgs?: string[];
}

export interface TranscodeResult {
  outputPath: string;
  duration: number;
  format: string;
  size: number;
  codec: string;
}

export interface ProgressInfo {
  jobId: string;
  percent: number;
  fps: number;
  speed: string;
  frame: number;
  time: string;
}

export interface VideoMetadata {
  duration: number;
  width: number;
  height: number;
  codec: string;
  audioCodec: string | null;
  bitrate: number;
  fps: number;
  format: string;
  size: number;
}

export interface VideoTranscodeConfig {
  ffmpegPath?: string;
  ffprobePath?: string;
  outputDir?: string;
}

export type EventMap = {
  onTranscodeComplete: { inputPath: string; outputPath: string; duration: number };
  onTranscodeFailed: { inputPath: string; error: string; exitCode: number };
  onProgress: { inputPath: string; percent: number; fps: number; speed: string };
};

type Listener<T> = (event: T) => void;

function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

export class VideoTranscode {
  private config: Required<VideoTranscodeConfig>;
  private jobs = new Map<string, { progress: ProgressInfo; inputDuration: number }>();
  private listeners: { [K in keyof EventMap]?: Listener<EventMap[K]>[] } = {};

  constructor(config: VideoTranscodeConfig = {}) {
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

  async getMetadata(inputPath: string): Promise<VideoMetadata> {
    const raw = await this.runProbe(inputPath);
    const data = JSON.parse(raw);

    const videoStream = data.streams?.find((s: Record<string, string>) => s.codec_type === "video");
    const audioStream = data.streams?.find((s: Record<string, string>) => s.codec_type === "audio");
    const format = data.format ?? {};

    const fpsStr = videoStream?.r_frame_rate ?? "0/1";
    const [fpsNum, fpsDen] = fpsStr.split("/").map(Number);
    const fps = fpsDen ? Math.round(fpsNum / fpsDen) : 0;

    return {
      duration: parseFloat(format.duration ?? "0"),
      width: parseInt(videoStream?.width ?? "0", 10),
      height: parseInt(videoStream?.height ?? "0", 10),
      codec: videoStream?.codec_name ?? "unknown",
      audioCodec: audioStream?.codec_name ?? null,
      bitrate: parseInt(format.bit_rate ?? "0", 10),
      fps,
      format: format.format_name ?? "unknown",
      size: parseInt(format.size ?? "0", 10),
    };
  }

  async transcode(inputPath: string, outputPath: string, options: TranscodeOptions = {}): Promise<TranscodeResult> {
    const jobId = generateId();
    const metadata = await this.getMetadata(inputPath);

    this.jobs.set(jobId, {
      progress: { jobId, percent: 0, fps: 0, speed: "0x", frame: 0, time: "00:00:00.00" },
      inputDuration: metadata.duration,
    });

    const args: string[] = ["-i", inputPath, "-y", "-progress", "pipe:1"];

    if (options.codec) args.push("-c:v", options.codec);
    if (options.audioCodec) args.push("-c:a", options.audioCodec);
    if (options.resolution) args.push("-s", options.resolution);
    if (options.bitrate) args.push("-b:v", options.bitrate);
    if (options.audioBitrate) args.push("-b:a", options.audioBitrate);
    if (options.fps) args.push("-r", String(options.fps));
    if (options.preset) args.push("-preset", options.preset);
    if (options.extraArgs) args.push(...options.extraArgs);

    args.push(outputPath);

    return new Promise<TranscodeResult>((resolve, reject) => {
      const proc = spawn(this.config.ffmpegPath, args, { stdio: ["ignore", "pipe", "pipe"] });
      let stderrData = "";

      proc.stdout.on("data", (chunk: Buffer) => {
        const text = chunk.toString();
        const job = this.jobs.get(jobId);
        if (!job) return;

        const frameMatch = text.match(/frame=(\d+)/);
        const fpsMatch = text.match(/fps=([\d.]+)/);
        const speedMatch = text.match(/speed=([\d.]+x)/);
        const timeMatch = text.match(/out_time_ms=(\d+)/);

        if (frameMatch) job.progress.frame = parseInt(frameMatch[1], 10);
        if (fpsMatch) job.progress.fps = parseFloat(fpsMatch[1]);
        if (speedMatch) job.progress.speed = speedMatch[1];
        if (timeMatch && job.inputDuration > 0) {
          const currentMs = parseInt(timeMatch[1], 10) / 1000;
          job.progress.percent = Math.min(100, Math.round((currentMs / (job.inputDuration * 1000)) * 100));
        }

        this.emit("onProgress", {
          inputPath,
          percent: job.progress.percent,
          fps: job.progress.fps,
          speed: job.progress.speed,
        });
      });

      proc.stderr.on("data", (chunk: Buffer) => {
        stderrData += chunk.toString();
      });

      proc.on("close", async (code) => {
        this.jobs.delete(jobId);

        if (code !== 0) {
          const error = stderrData.split("\n").filter(Boolean).pop() ?? `FFmpeg exited with code ${code}`;
          this.emit("onTranscodeFailed", { inputPath, error, exitCode: code ?? 1 });
          return reject(new Error(error));
        }

        try {
          const outStat = await stat(outputPath);
          const outMeta = await this.getMetadata(outputPath);
          const result: TranscodeResult = {
            outputPath,
            duration: outMeta.duration,
            format: outMeta.format,
            size: outStat.size,
            codec: outMeta.codec,
          };

          this.emit("onTranscodeComplete", {
            inputPath,
            outputPath,
            duration: outMeta.duration,
          });

          resolve(result);
        } catch (err) {
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      });

      proc.on("error", (err) => {
        this.jobs.delete(jobId);
        this.emit("onTranscodeFailed", { inputPath, error: err.message, exitCode: -1 });
        reject(err);
      });
    });
  }

  getProgress(jobId: string): ProgressInfo | null {
    const job = this.jobs.get(jobId);
    return job ? { ...job.progress } : null;
  }

  async extractThumbnail(inputPath: string, outputPath: string, timestamp?: number): Promise<string> {
    const time = timestamp ?? 0;
    const timeStr = new Date(time * 1000).toISOString().slice(11, 23);

    return new Promise<string>((resolve, reject) => {
      execFile(
        this.config.ffmpegPath,
        ["-i", inputPath, "-ss", timeStr, "-vframes", "1", "-y", outputPath],
        (error, _stdout, stderr) => {
          if (error) return reject(new Error(`Thumbnail extraction failed: ${stderr || error.message}`));
          resolve(outputPath);
        },
      );
    });
  }
}

export default VideoTranscode;
