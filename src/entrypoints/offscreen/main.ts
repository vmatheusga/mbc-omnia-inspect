import { newId, saveSession } from "../../shared/capture-store";
import type { OffscreenRequest, OffscreenResponse } from "../../shared/offscreen";
import { FrameEncoder } from "./encoder";

/**
 * Documento offscreen: recebe os quadros do background por uma Port e grava o
 * vídeo em IndexedDB quando a gravação para.
 */
const port = chrome.runtime.connect({ name: "offscreen" });
let encoder: FrameEncoder | null = null;
// Os quadros são processados em ordem (decodificar JPEG é assíncrono)
let queue: Promise<void> = Promise.resolve();

const reply = (response: OffscreenResponse) => port.postMessage(response);

port.onMessage.addListener((message: OffscreenRequest) => {
  switch (message.type) {
    case "start":
      encoder = new FrameEncoder(message.format, message.fps);
      queue = Promise.resolve();
      reply({ requestId: message.requestId, ok: true });
      break;
    case "frame": {
      const current = encoder;
      if (!current) return;
      queue = queue.then(() => current.addFrame(message.data, message.t)).catch((error) => console.error(error));
      break;
    }
    case "stop": {
      const current = encoder;
      encoder = null;
      queue
        .then(async () => {
          if (!current) throw new Error("Gravação não iniciada.");
          const { blob, durationMs } = await current.finish(message.t);
          const id = newId();
          await saveSession({
            id,
            kind: "video",
            url: message.meta.url,
            title: message.meta.title,
            createdAt: new Date().toISOString(),
            video: {
              blob,
              mime: current.mime,
              width: current.width,
              height: current.height,
              durationMs,
              frames: current.frames,
              viewport: message.meta.viewport,
              theme: message.meta.theme,
            },
          });
          reply({ requestId: message.requestId, ok: true, sessionId: id });
        })
        .catch((error: unknown) =>
          reply({ requestId: message.requestId, ok: false, error: String((error as Error)?.message ?? error) }),
        );
      break;
    }
  }
});
