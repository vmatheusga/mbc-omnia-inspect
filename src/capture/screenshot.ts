/**
 * Prints em vários tamanhos × temas, com área viewport, página inteira ou
 * elemento. Roda no background (chrome.debugger) e salva a sessão em IndexedDB.
 */
import { newId, saveSession, type CaptureSession, type StoredShot } from "../shared/capture-store";
import { chunkPlan, planShots } from "../shared/capture-plan";
import type { CaptureModeResponse, ElementRectResponse, ShotOptions, ShotsProgress, Theme } from "../shared/messages";
import {
  applyMetrics,
  attach,
  base64ToBlob,
  emulateTheme,
  ensureContent,
  hideScrollbars,
  restoreMetrics,
  send,
  sessions,
  sleep,
  toContent,
} from "./cdp";

export class CancelledError extends Error {
  constructor() {
    super("Captura cancelada.");
  }
}

interface Clip {
  x: number;
  y: number;
  width: number;
  height: number;
}

async function shoot(tabId: number, options: ShotOptions, clip?: Clip): Promise<Blob> {
  const res = await send<{ data: string }>(tabId, "Page.captureScreenshot", {
    format: options.format,
    quality: options.format === "png" ? undefined : 90,
    captureBeyondViewport: !!clip,
    clip: clip ? { ...clip, scale: 1 } : undefined,
  });
  return base64ToBlob(res.data, `image/${options.format}`);
}

/** Página inteira: uma imagem ou várias faixas unidas (páginas muito altas). */
async function shootFullPage(tabId: number, options: ShotOptions, width: number, height: number) {
  const plan = chunkPlan(height, options.dpr);
  const parts: Blob[] = [];
  for (const chunk of plan.chunks) parts.push(await shoot(tabId, options, { x: 0, y: chunk.y, width, height: chunk.height }));
  const total = plan.chunks.reduce((sum, c) => sum + c.height, 0);
  if (parts.length === 1) return { blob: parts[0], height: total, truncated: plan.truncated };

  const bitmaps = await Promise.all(parts.map((p) => createImageBitmap(p)));
  const canvas = new OffscreenCanvas(bitmaps[0].width, bitmaps.reduce((sum, b) => sum + b.height, 0));
  const ctx = canvas.getContext("2d")!;
  let y = 0;
  for (const bitmap of bitmaps) {
    ctx.drawImage(bitmap, 0, y);
    y += bitmap.height;
    bitmap.close();
  }
  const blob = await canvas.convertToBlob({ type: `image/${options.format}`, quality: 0.9 });
  return { blob, height: total, truncated: plan.truncated };
}

export async function runShots(
  tabId: number,
  options: ShotOptions,
  onProgress: (progress: ShotsProgress) => void,
  cancelled: () => boolean,
): Promise<CaptureSession> {
  const previous = sessions.get(tabId)?.applied ?? null;
  const tab = await chrome.tabs.get(tabId);
  await ensureContent(tabId);
  const plan = planShots(options.sizes, options.theme);
  const shots: StoredShot[] = [];
  let theme: Theme | null = null;
  let lazyDone = false;

  const mode = await toContent<CaptureModeResponse>(tabId, {
    type: "capture-mode",
    on: true,
    freeze: options.freeze,
    element: options.area === "element",
  });
  try {
    if (options.area === "element" && !mode.element) {
      throw new Error("Selecione um elemento na aba Inspecionar antes de capturar a área “Elemento”.");
    }
    await attach(tabId);
    if (options.hideScrollbars) await hideScrollbars(tabId, true);

    for (const [index, item] of plan.entries()) {
      if (cancelled()) throw new CancelledError();
      onProgress({
        done: index,
        total: plan.length,
        label: [item.viewport.label, item.theme === "dark" ? "escuro" : item.theme === "light" ? "claro" : ""]
          .filter(Boolean)
          .join(" · "),
      });

      if (item.theme !== theme) {
        theme = item.theme;
        await emulateTheme(tabId, theme);
        if (options.forceDarkClass) await toContent(tabId, { type: "capture-theme", theme });
      }
      const applied = await applyMetrics(tabId, item.viewport, { fit: false, dpr: options.dpr });
      await sleep(options.delayMs);

      const shot: StoredShot = {
        id: newId(),
        viewport: item.viewport,
        theme: item.theme,
        width: applied.width,
        height: applied.height,
        dpr: options.dpr,
        blob: null,
      };

      if (options.area === "full") {
        const page = await toContent<{ ok: boolean; height?: number }>(tabId, {
          type: "capture-page",
          toTop: true,
          lazy: options.lazy && !lazyDone,
          expand: options.expandInner,
        });
        lazyDone = true;
        await sleep(150);
        const metrics = await send<{ cssContentSize: { height: number }; cssLayoutViewport: { clientWidth: number } }>(
          tabId,
          "Page.getLayoutMetrics",
        );
        const width = Math.round(metrics.cssLayoutViewport.clientWidth) || applied.width;
        const height = Math.max(metrics.cssContentSize.height, page.height ?? 0, applied.height);
        const full = await shootFullPage(tabId, options, width, height);
        Object.assign(shot, { blob: full.blob, width, height: full.height, truncated: full.truncated || undefined });
        await toContent(tabId, { type: "capture-page-restore" });
      } else if (options.area === "element") {
        const res = await toContent<ElementRectResponse>(tabId, { type: "capture-element", padding: options.padding });
        await sleep(80);
        if (res.rect) {
          shot.blob = await shoot(tabId, options, res.rect);
          shot.width = Math.round(res.rect.width);
          shot.height = Math.round(res.rect.height);
        }
      } else {
        shot.blob = await shoot(tabId, options);
      }
      shots.push(shot);
    }
    onProgress({ done: plan.length, total: plan.length, label: "Salvando…" });

    const session: CaptureSession = {
      id: newId(),
      kind: "prints",
      url: tab.url ?? "",
      title: tab.title ?? "",
      createdAt: new Date().toISOString(),
      area: options.area,
      format: options.format,
      frame: options.frame,
      element: mode.element?.label,
      shots,
    };
    await saveSession(session);
    return session;
  } finally {
    // devolve a página como estava
    await toContent(tabId, { type: "capture-mode", on: false }).catch(() => {});
    if (sessions.has(tabId)) {
      if (theme) await emulateTheme(tabId, null).catch(() => {});
      if (options.hideScrollbars) await hideScrollbars(tabId, false);
    }
    await restoreMetrics(tabId, previous).catch(() => {});
  }
}
