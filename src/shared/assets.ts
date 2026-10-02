export type AssetKind = "svg" | "image";

export type AssetSource = "svg-inline" | "img" | "picture" | "css" | "favicon" | "video-poster";

export interface PageAsset {
  /** Chave de deduplicação (URL ou markup normalizado). */
  key: string;
  kind: AssetKind;
  /** svg, png, jpg, webp, gif, avif, ico, bmp… ou "?" quando não dá para saber pela URL. */
  format: string;
  /** Nome sugerido (sem extensão), já em kebab-case. */
  name: string;
  source: AssetSource;
  url?: string;
  /** Markup do SVG inline (serializado, com xmlns). */
  svg?: string;
  /** Dimensões intrínsecas (naturalWidth/viewBox). */
  width: number;
  height: number;
  renderedWidth: number;
  renderedHeight: number;
  /** Elementos da página que usam o asset (ids do registro do content script). */
  elementIds: string[];
  count: number;
  alt?: string;
}

export const IMAGE_FORMATS = ["png", "jpg", "webp", "gif", "avif", "ico", "bmp", "tiff"] as const;

const MIME_TO_FORMAT: Record<string, string> = {
  "image/svg+xml": "svg",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
  "image/x-icon": "ico",
  "image/vnd.microsoft.icon": "ico",
  "image/bmp": "bmp",
  "image/tiff": "tiff",
};

export function formatFromMime(mime: string | null | undefined): string | undefined {
  if (!mime) return undefined;
  return MIME_TO_FORMAT[mime.split(";")[0].trim().toLowerCase()];
}

/** Descobre o formato pela URL (extensão, data: URL ou parâmetros de otimizadores). */
export function formatFromUrl(raw: string): string {
  if (raw.startsWith("data:")) return formatFromMime(raw.slice(5, raw.indexOf(";"))) ?? "?";
  try {
    const url = new URL(raw, "http://x");
    // Otimizadores: /_next/image?url=/foto.png, ?format=webp, ?fm=webp
    const fmt = url.searchParams.get("format") ?? url.searchParams.get("fm") ?? url.searchParams.get("f");
    if (fmt && /^(png|jpe?g|webp|gif|avif|svg)$/i.test(fmt)) return normalizeExt(fmt);
    const inner = url.searchParams.get("url");
    if (inner) {
      const innerFormat = formatFromUrl(inner);
      if (innerFormat !== "?") return innerFormat;
    }
    const ext = url.pathname.match(/\.([a-z0-9]{2,5})$/i)?.[1];
    return ext ? normalizeExt(ext) : "?";
  } catch {
    return "?";
  }
}

function normalizeExt(ext: string): string {
  const e = ext.toLowerCase();
  if (e === "jpeg" || e === "jfif") return "jpg";
  if (e === "tif") return "tiff";
  return e;
}

/** kebab-case sem acentos, seguro para nome de arquivo. */
export function slugify(text: string, max = 60): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max)
    .replace(/-+$/g, "");
}

/** Nome de arquivo a partir da URL, sem hashes de build (logo.3f9a2c.png → logo). */
export function nameFromUrl(raw: string): string | undefined {
  if (raw.startsWith("data:")) return undefined;
  try {
    const url = new URL(raw, "http://x");
    const inner = url.searchParams.get("url");
    const path = inner ? new URL(inner, "http://x").pathname : url.pathname;
    const file = decodeURIComponent(path.split("/").pop() ?? "");
    const base = file.replace(/\.[a-z0-9]{2,5}$/i, "").replace(/[.-][a-f0-9]{6,}$/i, "");
    return slugify(base) || undefined;
  } catch {
    return undefined;
  }
}
