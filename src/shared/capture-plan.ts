/** Regras puras da captura (testadas no Vitest). */
import { slugify } from "./assets";
import type { ImageFormat, Theme, ThemeChoice, ViewportSpec } from "./messages";

export function themesOf(choice: ThemeChoice): Array<Theme | null> {
  if (choice === "both") return ["light", "dark"];
  if (choice === "current") return [null];
  return [choice];
}

export interface PlannedShot {
  viewport: ViewportSpec;
  theme: Theme | null;
}

/** Ordem: tema por fora (troca de tema é mais lenta que troca de tamanho). */
export function planShots(sizes: ViewportSpec[], choice: ThemeChoice): PlannedShot[] {
  return themesOf(choice).flatMap((theme) => sizes.map((viewport) => ({ viewport, theme })));
}

export const THEME_LABEL: Record<Theme, string> = { light: "claro", dark: "escuro" };

/** Maior lado de uma captura em px de dispositivo (limite de textura do Chrome). */
export const MAX_CAPTURE_PX = 16000;
/** Altura máxima de uma imagem final em px de dispositivo (limite do canvas). */
export const MAX_IMAGE_PX = 32000;

/**
 * Faixas (px CSS) para capturar uma página alta. Cada faixa respeita o limite
 * de textura; o total é cortado no limite do canvas.
 */
export function chunkPlan(height: number, dpr: number): { chunks: Array<{ y: number; height: number }>; truncated: boolean } {
  const maxTotal = Math.floor(MAX_IMAGE_PX / dpr);
  const total = Math.min(Math.ceil(height), maxTotal);
  const step = Math.floor(MAX_CAPTURE_PX / dpr);
  const chunks: Array<{ y: number; height: number }> = [];
  for (let y = 0; y < total; y += step) chunks.push({ y, height: Math.min(step, total - y) });
  return { chunks, truncated: Math.ceil(height) > maxTotal };
}

function hostAndRoute(url: string) {
  try {
    const u = new URL(url);
    const route = u.pathname
      .split("/")
      .map((part) => {
        try {
          return slugify(decodeURIComponent(part));
        } catch {
          return slugify(part);
        }
      })
      .filter(Boolean)
      .join("-");
    return { host: slugify(u.host) || "pagina", route };
  } catch {
    return { host: "pagina", route: "" };
  }
}

export const EXT: Record<ImageFormat, string> = { png: "png", jpeg: "jpg", webp: "webp" };

/** `localhost-5178-produtos-md-768x1024@2x-escuro.png` */
export function shotFilename(
  url: string,
  shot: { viewport: ViewportSpec; width: number; height: number; dpr: number; theme: Theme | null },
  ext: string,
  extra?: string,
) {
  const { host, route } = hostAndRoute(url);
  return [
    host,
    route,
    slugify(shot.viewport.label),
    `${shot.width}x${shot.height}${shot.dpr > 1 ? `@${shot.dpr}x` : ""}`,
    shot.theme ? THEME_LABEL[shot.theme] : "",
    extra ? slugify(extra) : "",
  ]
    .filter(Boolean)
    .join("-")
    .concat(`.${ext}`);
}

export function videoFilename(url: string, viewport: ViewportSpec, ext: string, createdAt: string) {
  const { host, route } = hostAndRoute(url);
  const stamp = createdAt.slice(0, 16).replace(/[:T]/g, "-");
  return [host, route, slugify(viewport.label), stamp].filter(Boolean).join("-").concat(`.${ext}`);
}

export function zipFilename(url: string, createdAt: string) {
  const { host } = hostAndRoute(url);
  return `${host}-capturas-${createdAt.slice(0, 16).replace(/[:T]/g, "-")}.zip`;
}
