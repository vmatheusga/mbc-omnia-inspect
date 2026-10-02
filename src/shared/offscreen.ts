/** Protocolo background ↔ documento offscreen (codificador de vídeo), via Port. */
import type { RecordOptions, Theme, ViewportSpec } from "./messages";

export type OffscreenRequest =
  | { type: "start"; requestId: string; format: RecordOptions["format"]; fps: number }
  | { type: "frame"; requestId: ""; data: string; t: number }
  | {
      type: "stop";
      requestId: string;
      /** Duração final (s). */
      t: number;
      meta: { url: string; title: string; viewport: ViewportSpec; theme: Theme | null };
    };

export type OffscreenResponse =
  | { requestId: string; ok: true; sessionId?: string }
  | { requestId: string; ok: false; error: string };

/** Pedido sem o id (o id é gerado por quem envia). */
export type OffscreenCommand = OffscreenRequest extends infer R ? (R extends unknown ? Omit<R, "requestId"> : never) : never;
