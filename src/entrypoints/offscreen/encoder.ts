/**
 * Codifica quadros JPEG com carimbo de tempo em MP4 (H.264) ou WebM (VP9/VP8)
 * usando WebCodecs. Os carimbos vêm do screencast, então o vídeo respeita o
 * tempo real mesmo quando a página fica parada (quadros de duração variável).
 */
import { ArrayBufferTarget as Mp4Target, Muxer as Mp4Muxer } from "mp4-muxer";
import { ArrayBufferTarget as WebmTarget, Muxer as WebmMuxer } from "webm-muxer";

const KEYFRAME_EVERY = 2; // s

interface Codec {
  container: "mp4" | "webm";
  codec: string;
  muxerCodec: string;
}

const MP4_CODECS = ["avc1.640034", "avc1.640033", "avc1.4d0033", "avc1.42003e", "avc1.640028", "avc1.42001f"];
const WEBM_CODECS: Array<[string, string]> = [
  ["vp09.00.40.08", "V_VP9"],
  ["vp09.00.10.08", "V_VP9"],
  ["vp8", "V_VP8"],
];

const even = (n: number) => Math.max(2, Math.floor(n / 2) * 2);

function bitrateFor(width: number, height: number, fps: number) {
  return Math.round(Math.min(20e6, Math.max(2e6, width * height * fps * 0.12)));
}

async function pickCodec(prefer: "mp4" | "webm", width: number, height: number, fps: number): Promise<Codec> {
  const base = { width, height, bitrate: bitrateFor(width, height, fps), framerate: fps };
  const mp4 = async () => {
    for (const codec of MP4_CODECS) {
      const res = await VideoEncoder.isConfigSupported({ ...base, codec, avc: { format: "avc" } }).catch(() => null);
      if (res?.supported) return { container: "mp4" as const, codec, muxerCodec: "avc" };
    }
  };
  const webm = async () => {
    for (const [codec, muxerCodec] of WEBM_CODECS) {
      const res = await VideoEncoder.isConfigSupported({ ...base, codec }).catch(() => null);
      if (res?.supported) return { container: "webm" as const, codec, muxerCodec };
    }
  };
  const found = prefer === "mp4" ? ((await mp4()) ?? (await webm())) : ((await webm()) ?? (await mp4()));
  if (!found) throw new Error("Este Chrome não tem codificador de vídeo disponível.");
  return found;
}

function decodeJpeg(data: string): Promise<ImageBitmap> {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return createImageBitmap(new Blob([bytes], { type: "image/jpeg" }));
}

export class FrameEncoder {
  private canvas: OffscreenCanvas | null = null;
  private ctx: OffscreenCanvasRenderingContext2D | null = null;
  private encoder: VideoEncoder | null = null;
  private muxer: Mp4Muxer<Mp4Target> | WebmMuxer<WebmTarget> | null = null;
  private codec: Codec | null = null;
  private lastT = -1;
  private lastKeyT = -Infinity;
  private failure: Error | null = null;
  frames = 0;
  width = 0;
  height = 0;

  constructor(
    private prefer: "mp4" | "webm",
    private fps: number,
  ) {}

  get mime() {
    return this.codec?.container === "webm" ? "video/webm" : "video/mp4";
  }

  private async setup(first: ImageBitmap) {
    this.width = even(first.width);
    this.height = even(first.height);
    this.canvas = new OffscreenCanvas(this.width, this.height);
    this.ctx = this.canvas.getContext("2d", { alpha: false })!;
    this.codec = await pickCodec(this.prefer, this.width, this.height, this.fps);
    const video = { codec: this.codec.muxerCodec, width: this.width, height: this.height };
    this.muxer =
      this.codec.container === "mp4"
        ? new Mp4Muxer({
            target: new Mp4Target(),
            video: { ...video, codec: "avc" },
            fastStart: "in-memory",
            firstTimestampBehavior: "offset",
          })
        : new WebmMuxer({
            target: new WebmTarget(),
            video: { ...video, frameRate: this.fps },
            firstTimestampBehavior: "offset",
          });
    const muxer = this.muxer;
    this.encoder = new VideoEncoder({
      output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
      error: (e) => {
        this.failure = e instanceof Error ? e : new Error(String(e));
      },
    });
    this.encoder.configure({
      codec: this.codec.codec,
      width: this.width,
      height: this.height,
      bitrate: bitrateFor(this.width, this.height, this.fps),
      framerate: this.fps,
      latencyMode: "quality",
      ...(this.codec.container === "mp4" ? { avc: { format: "avc" as const } } : {}),
    });
  }

  private encodeCanvas(t: number) {
    if (!this.encoder || !this.canvas || t <= this.lastT) return;
    // fila cheia: descarta (gravação em tempo real)
    if (this.encoder.encodeQueueSize > 12) return;
    const frame = new VideoFrame(this.canvas, { timestamp: Math.round(t * 1e6) });
    const keyFrame = t - this.lastKeyT >= KEYFRAME_EVERY;
    if (keyFrame) this.lastKeyT = t;
    this.encoder.encode(frame, { keyFrame });
    frame.close();
    this.lastT = t;
    this.frames++;
  }

  async addFrame(data: string, t: number) {
    if (this.failure) return;
    const bitmap = await decodeJpeg(data);
    try {
      if (!this.encoder) await this.setup(bitmap);
      this.ctx!.drawImage(bitmap, 0, 0, this.width, this.height);
    } finally {
      bitmap.close();
    }
    this.encodeCanvas(t);
  }

  /** Repete o último quadro no fim (para a duração bater) e fecha o arquivo. */
  async finish(t: number): Promise<{ blob: Blob; durationMs: number }> {
    if (this.failure) throw this.failure;
    if (!this.encoder || !this.muxer) throw new Error("Nenhum quadro foi gravado.");
    if (t > this.lastT + 0.05) this.encodeCanvas(t);
    await this.encoder.flush();
    this.encoder.close();
    if (this.failure) throw this.failure;
    this.muxer.finalize();
    const buffer = (this.muxer.target as Mp4Target | WebmTarget).buffer;
    return { blob: new Blob([buffer], { type: this.mime }), durationMs: Math.round(Math.max(t, this.lastT) * 1000) };
  }
}
