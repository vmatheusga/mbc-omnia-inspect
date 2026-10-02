/** Vídeo → GIF (amostra quadros com <video> e codifica com gifenc). */
import { GIFEncoder, applyPalette, quantize } from "gifenc";

export const MAX_GIF_FRAMES = 600;

export async function videoToGif(
  blob: Blob,
  opts: { width: number; fps: number; durationMs: number },
  onProgress: (ratio: number) => void,
): Promise<Blob> {
  const url = URL.createObjectURL(blob);
  const video = document.createElement("video");
  video.muted = true;
  video.preload = "auto";
  video.src = url;
  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => reject(new Error("Não foi possível ler o vídeo."));
    });
    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : opts.durationMs / 1000;
    const width = Math.min(opts.width, video.videoWidth);
    const height = Math.round((width * video.videoHeight) / video.videoWidth);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    const fps = Math.min(opts.fps, MAX_GIF_FRAMES / Math.max(duration, 0.1));
    const step = 1 / fps;
    const gif = GIFEncoder();
    for (let t = 0; t < duration; t += step) {
      await new Promise<void>((resolve) => {
        video.onseeked = () => resolve();
        video.currentTime = Math.min(t, duration - 0.001);
      });
      ctx.drawImage(video, 0, 0, width, height);
      const { data } = ctx.getImageData(0, 0, width, height);
      const palette = quantize(data, 256);
      gif.writeFrame(applyPalette(data, palette), width, height, { palette, delay: Math.round(step * 1000) });
      onProgress(Math.min(1, (t + step) / duration));
    }
    gif.finish();
    return new Blob([gif.bytes() as Uint8Array<ArrayBuffer>], { type: "image/gif" });
  } finally {
    URL.revokeObjectURL(url);
  }
}
