import { formatFromMime, type PageAsset } from "../../../shared/assets";
import type { FetchAssetResponse, PanelMessage } from "../../../shared/messages";

export type SvgExport = "svg" | "png@1x" | "png@2x" | "png@3x";

export type Requester = <T>(message: PanelMessage) => Promise<T | undefined>;

export interface AssetMeta {
  bytes?: number;
  format?: string;
}

/** Tamanho e tipo reais (HEAD), para imagens com URL http(s). */
export async function probeMeta(url: string): Promise<AssetMeta> {
  if (!/^https?:/.test(url)) return {};
  try {
    let res = await fetch(url, { method: "HEAD", credentials: "include" });
    if (!res.ok || !res.headers.get("content-type")) res = await fetch(url, { credentials: "include" });
    const length = res.headers.get("content-length");
    return {
      bytes: length ? Number(length) : undefined,
      format: formatFromMime(res.headers.get("content-type")),
    };
  } catch {
    return {};
  }
}

async function fetchBlob(url: string, request: Requester): Promise<Blob> {
  if (/^(https?|data):/.test(url)) {
    try {
      const res = await fetch(url, { credentials: "include" });
      if (res.ok) return await res.blob();
    } catch {
      /* tenta pela página */
    }
  }
  // blob: URLs e recursos que só a página consegue buscar
  const response = await request<FetchAssetResponse>({ type: "fetch-asset", url });
  if (!response?.ok) throw new Error(response && !response.ok ? response.error : "não foi possível baixar");
  return await (await fetch(response.dataUrl)).blob();
}

export async function svgToPng(markup: string, width: number, height: number, scale: number): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([markup], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    const w = Math.max(1, Math.round((width || img.naturalWidth || 24) * scale));
    const h = Math.max(1, Math.round((height || img.naturalHeight || 24) * scale));
    const canvas = new OffscreenCanvas(w, h);
    canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
    return await canvas.convertToBlob({ type: "image/png" });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function svgMarkup(asset: PageAsset, request: Requester): Promise<string> {
  if (asset.svg) return asset.svg;
  if (!asset.url) throw new Error("SVG sem conteúdo");
  return await (await fetchBlob(asset.url, request)).text();
}

/** Conteúdo final do arquivo + extensão. */
export async function assetFile(
  asset: PageAsset,
  svgAs: SvgExport,
  request: Requester,
): Promise<{ blob: Blob; ext: string }> {
  if (asset.kind === "svg") {
    const markup = await svgMarkup(asset, request);
    if (svgAs === "svg") return { blob: new Blob([markup], { type: "image/svg+xml" }), ext: "svg" };
    const scale = Number(svgAs.split("@")[1].replace("x", ""));
    const w = asset.width || asset.renderedWidth;
    const h = asset.height || asset.renderedHeight;
    return { blob: await svgToPng(markup, w, h, scale), ext: scale === 1 ? "png" : `@${scale}x.png` };
  }
  const blob = await fetchBlob(asset.url!, request);
  const ext = formatFromMime(blob.type) ?? (asset.format !== "?" ? asset.format : "png");
  return { blob, ext };
}

/** `nome.svg`, `nome@2x.png`. */
export function fileName(name: string, ext: string) {
  return ext.startsWith("@") ? `${name}${ext}` : `${name}.${ext}`;
}

export function formatBytes(bytes?: number): string | undefined {
  if (bytes === undefined || Number.isNaN(bytes)) return undefined;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10240 ? 1 : 0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Miniatura segura: SVG da página só é exibido via <img> (nunca injetado no DOM). */
export function thumbnailSrc(asset: PageAsset): string | undefined {
  if (asset.svg) return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(asset.svg)}`;
  return asset.url;
}
