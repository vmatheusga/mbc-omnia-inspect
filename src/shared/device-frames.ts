/**
 * Molduras de dispositivo desenhadas em canvas (sem imagens externas):
 * celular, tablet e janela de navegador. Aplicadas na exportação, então a
 * captura original nunca é alterada.
 */
import type { FrameMode } from "./messages";

export type FrameKind = "phone" | "tablet" | "browser";
export type FrameBackground = "transparent" | "white" | "gray";

export const FRAME_LABEL: Record<FrameMode, string> = {
  none: "Nenhuma",
  auto: "Automática",
  phone: "Celular",
  tablet: "Tablet",
  browser: "Navegador",
};

export function frameKindFor(width: number): FrameKind {
  if (width < 600) return "phone";
  if (width < 1100) return "tablet";
  return "browser";
}

export function resolveFrame(mode: FrameMode, viewportWidth: number): FrameKind | null {
  if (mode === "none") return null;
  return mode === "auto" ? frameKindFor(viewportWidth) : mode;
}

const SPEC = {
  phone: { margin: 48, bezel: 14, outer: 56, screen: 44, top: 0 },
  tablet: { margin: 48, bezel: 24, outer: 40, screen: 18, top: 0 },
  browser: { margin: 48, bezel: 0, outer: 12, screen: 0, top: 44 },
} as const;

export interface FrameLayout {
  width: number;
  height: number;
  /** Corpo do aparelho/janela. */
  body: { x: number; y: number; width: number; height: number; radius: number };
  /** Onde a captura é desenhada. */
  screen: { x: number; y: number; width: number; height: number; radius: number };
  scale: number;
}

/** Geometria em px da imagem (a captura já está em px de dispositivo: `scale` = DPR). */
export function frameLayout(kind: FrameKind, imageWidth: number, imageHeight: number, scale: number): FrameLayout {
  const s = SPEC[kind];
  const m = s.margin * scale;
  const b = s.bezel * scale;
  const top = s.top * scale;
  const body = {
    x: m,
    y: m,
    width: imageWidth + b * 2,
    height: imageHeight + b * 2 + top,
    radius: s.outer * scale,
  };
  return {
    width: body.width + m * 2,
    height: body.height + m * 2,
    body,
    screen: { x: m + b, y: m + b + top, width: imageWidth, height: imageHeight, radius: s.screen * scale },
    scale,
  };
}

type Ctx = OffscreenCanvasRenderingContext2D;

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number | number[]) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

const BACKGROUNDS: Record<FrameBackground, string | null> = { transparent: null, white: "#ffffff", gray: "#e9ecef" };

export interface FrameOptions {
  mode: FrameMode;
  viewportWidth: number;
  /** DPR da captura. */
  scale: number;
  background: FrameBackground;
  /** Endereço mostrado na barra do navegador. */
  url?: string;
}

/** Desenha a captura dentro da moldura. Retorna a própria imagem quando a moldura é "nenhuma". */
export async function renderFramed(image: Blob, options: FrameOptions): Promise<Blob> {
  const kind = resolveFrame(options.mode, options.viewportWidth);
  if (!kind) return image;
  const bitmap = await createImageBitmap(image);
  const L = frameLayout(kind, bitmap.width, bitmap.height, options.scale);
  const canvas = new OffscreenCanvas(L.width, L.height);
  const ctx = canvas.getContext("2d")!;
  const s = L.scale;

  const bg = BACKGROUNDS[options.background];
  if (bg) {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, L.width, L.height);
  }

  // Corpo com sombra
  const { body, screen } = L;
  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.22)";
  ctx.shadowBlur = 36 * s;
  ctx.shadowOffsetY = 14 * s;
  roundRect(ctx, body.x, body.y, body.width, body.height, body.radius);
  ctx.fillStyle = kind === "browser" ? "#f1f3f4" : "#16181a";
  ctx.fill();
  ctx.restore();

  if (kind === "phone") {
    // botões laterais
    ctx.fillStyle = "#0c0d0e";
    const side = (x: number, y: number, h: number) => {
      roundRect(ctx, x, body.y + y * s, 4 * s, h * s, 2 * s);
      ctx.fill();
    };
    side(body.x - 3 * s, 110, 32);
    side(body.x - 3 * s, 160, 56);
    side(body.x - 3 * s, 226, 56);
    side(body.x + body.width - s, 180, 88);
    // aro
    roundRect(ctx, body.x + 1.5 * s, body.y + 1.5 * s, body.width - 3 * s, body.height - 3 * s, body.radius - 1.5 * s);
    ctx.strokeStyle = "#3a3d40";
    ctx.lineWidth = 2 * s;
    ctx.stroke();
  }

  if (kind === "browser") {
    // barra: semáforo + endereço
    roundRect(ctx, body.x + 0.5 * s, body.y + 0.5 * s, body.width - s, body.height - s, body.radius);
    ctx.strokeStyle = "rgba(0, 0, 0, 0.12)";
    ctx.lineWidth = s;
    ctx.stroke();
    const cy = body.y + 22 * s;
    ["#ff5f57", "#febc2e", "#28c840"].forEach((color, i) => {
      ctx.beginPath();
      ctx.arc(body.x + (20 + i * 18) * s, cy, 6 * s, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    });
    const barX = body.x + 84 * s;
    const barW = Math.min(body.width - 168 * s, 720 * s);
    const barLeft = Math.max(barX, body.x + (body.width - barW) / 2);
    roundRect(ctx, barLeft, cy - 14 * s, barW, 28 * s, 14 * s);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    if (options.url) {
      let text = options.url;
      try {
        const u = new URL(options.url);
        text = `${u.host}${u.pathname === "/" ? "" : u.pathname}`;
      } catch {
        /* texto livre */
      }
      ctx.fillStyle = "#5f6368";
      ctx.font = `${13 * s}px Inter, ui-sans-serif, system-ui, -apple-system, sans-serif`;
      ctx.textBaseline = "middle";
      ctx.textAlign = "center";
      const max = barW - 32 * s;
      while (text.length > 4 && ctx.measureText(text).width > max) text = `${text.slice(0, -2)}…`;
      ctx.fillText(text, barLeft + barW / 2, cy + s);
    }
  }

  // Tela
  ctx.save();
  const radii = kind === "browser" ? [0, 0, body.radius, body.radius] : screen.radius;
  roundRect(ctx, screen.x, screen.y, screen.width, screen.height, radii);
  ctx.clip();
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(screen.x, screen.y, screen.width, screen.height);
  ctx.drawImage(bitmap, screen.x, screen.y);
  ctx.restore();
  bitmap.close();

  if (kind === "phone") {
    // ilha dinâmica
    const w = 120 * s;
    const h = 34 * s;
    roundRect(ctx, screen.x + (screen.width - w) / 2, screen.y + 11 * s, w, h, h / 2);
    ctx.fillStyle = "#000000";
    ctx.fill();
  }
  if (kind === "tablet") {
    ctx.beginPath();
    ctx.arc(body.x + body.width / 2, body.y + 12 * s, 3.5 * s, 0, Math.PI * 2);
    ctx.fillStyle = "#2a2d30";
    ctx.fill();
  }

  return canvas.convertToBlob({ type: "image/png" });
}
