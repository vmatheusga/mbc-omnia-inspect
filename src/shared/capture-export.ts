/** Exportação das capturas (painel e galeria): moldura, cópia e zip. */
import { EXT, shotFilename, zipFilename } from "./capture-plan";
import type { CaptureSession, StoredShot } from "./capture-store";
import { renderFramed, resolveFrame, type FrameBackground } from "./device-frames";
import type { FrameMode } from "./messages";
import { createZip } from "./zip";

export interface ExportLook {
  frame: FrameMode;
  background: FrameBackground;
}

/** Imagem final do print (com a moldura escolhida). */
export async function exportShot(session: CaptureSession, shot: StoredShot, look: ExportLook) {
  if (!shot.blob) return null;
  const framed = resolveFrame(look.frame, shot.viewport.width);
  const blob = framed
    ? await renderFramed(shot.blob, {
        mode: look.frame,
        viewportWidth: shot.viewport.width,
        scale: shot.dpr,
        background: look.background,
        url: session.url,
      })
    : shot.blob;
  const ext = framed ? "png" : EXT[session.format ?? "png"];
  const extra = [session.area === "element" ? session.element : "", framed ? `moldura-${framed}` : ""]
    .filter(Boolean)
    .join(" ");
  return { blob, filename: shotFilename(session.url, shot, ext, extra) };
}

export async function toPng(blob: Blob): Promise<Blob> {
  if (blob.type === "image/png") return blob;
  const bitmap = await createImageBitmap(blob);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
  bitmap.close();
  return canvas.convertToBlob({ type: "image/png" });
}

/** A área de transferência só aceita PNG. */
export async function copyImage(blob: Blob) {
  await navigator.clipboard.write([new ClipboardItem({ "image/png": toPng(blob) })]);
}

export async function sessionZip(session: CaptureSession, look: ExportLook) {
  const entries: Array<{ path: string; data: Uint8Array }> = [];
  for (const shot of session.shots ?? []) {
    const out = await exportShot(session, shot, look);
    if (out) entries.push({ path: out.filename, data: new Uint8Array(await out.blob.arrayBuffer()) });
  }
  return { blob: createZip(entries), filename: zipFilename(session.url, session.createdAt) };
}
