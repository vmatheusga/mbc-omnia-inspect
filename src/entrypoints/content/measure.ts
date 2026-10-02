import type { Box } from "./frames";

export interface Line {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** Distância em px (CSS do elemento, já sem a escala da moldura). */
  label: number;
  /** Linha-guia tracejada (sem etiqueta). */
  guide?: boolean;
}

const r = (n: number) => Math.round(n * 100) / 100;

/**
 * Distâncias entre dois retângulos, como os "redlines" do Figma.
 * `a` é o elemento selecionado e `b` o que está sob o mouse.
 */
export function measure(a: Box, b: Box): Line[] {
  const scale = a.scale || 1;
  const A = { l: a.left, t: a.top, r: a.left + a.width, b: a.top + a.height };
  const B = { l: b.left, t: b.top, r: b.left + b.width, b: b.top + b.height };
  const lines: Line[] = [];
  const dist = (n: number) => r(Math.abs(n) / scale);

  const contains = (o: typeof A, i: typeof A) => i.l >= o.l && i.r <= o.r && i.t >= o.t && i.b <= o.b;
  if (contains(A, B) || contains(B, A)) {
    const [outer, inner] = contains(A, B) ? [A, B] : [B, A];
    const cx = (inner.l + inner.r) / 2;
    const cy = (inner.t + inner.b) / 2;
    if (inner.t > outer.t) lines.push({ x1: cx, y1: outer.t, x2: cx, y2: inner.t, label: dist(inner.t - outer.t) });
    if (outer.b > inner.b) lines.push({ x1: cx, y1: inner.b, x2: cx, y2: outer.b, label: dist(outer.b - inner.b) });
    if (inner.l > outer.l) lines.push({ x1: outer.l, y1: cy, x2: inner.l, y2: cy, label: dist(inner.l - outer.l) });
    if (outer.r > inner.r) lines.push({ x1: inner.r, y1: cy, x2: outer.r, y2: cy, label: dist(outer.r - inner.r) });
    return lines;
  }

  const overlapY: [number, number] = [Math.max(A.t, B.t), Math.min(A.b, B.b)];
  const overlapX: [number, number] = [Math.max(A.l, B.l), Math.min(A.r, B.r)];
  const hasOverlapY = overlapY[1] > overlapY[0];
  const hasOverlapX = overlapX[1] > overlapX[0];

  // Horizontal: espaço entre as bordas verticais mais próximas
  let hGap: { from: number; to: number } | null = null;
  if (B.l >= A.r) hGap = { from: A.r, to: B.l };
  else if (A.l >= B.r) hGap = { from: B.r, to: A.l };
  // Vertical
  let vGap: { from: number; to: number } | null = null;
  if (B.t >= A.b) vGap = { from: A.b, to: B.t };
  else if (A.t >= B.b) vGap = { from: B.b, to: A.t };

  if (hGap) {
    const y = hasOverlapY ? (overlapY[0] + overlapY[1]) / 2 : (A.t + A.b) / 2;
    lines.push({ x1: hGap.from, y1: y, x2: hGap.to, y2: y, label: dist(hGap.to - hGap.from) });
    if (!hasOverlapY) {
      // guia do retângulo B até a altura da linha
      const x = hGap.to === B.l ? B.l : B.r;
      lines.push({ x1: x, y1: y, x2: x, y2: y < B.t ? B.t : B.b, label: 0, guide: true });
    }
  }
  if (vGap) {
    const x = hasOverlapX ? (overlapX[0] + overlapX[1]) / 2 : (A.l + A.r) / 2;
    lines.push({ x1: x, y1: vGap.from, x2: x, y2: vGap.to, label: dist(vGap.to - vGap.from) });
    if (!hasOverlapX) {
      const y = vGap.to === B.t ? B.t : B.b;
      lines.push({ x1: x, y1: y, x2: x < B.l ? B.l : B.r, y2: y, label: 0, guide: true });
    }
  }

  // Sobreposição parcial: distâncias entre bordas correspondentes
  if (!hGap && !vGap) {
    const cx = (overlapX[0] + overlapX[1]) / 2;
    const cy = (overlapY[0] + overlapY[1]) / 2;
    if (A.t !== B.t) lines.push({ x1: cx, y1: Math.min(A.t, B.t), x2: cx, y2: Math.max(A.t, B.t), label: dist(A.t - B.t) });
    if (A.b !== B.b) lines.push({ x1: cx, y1: Math.min(A.b, B.b), x2: cx, y2: Math.max(A.b, B.b), label: dist(A.b - B.b) });
    if (A.l !== B.l) lines.push({ x1: Math.min(A.l, B.l), y1: cy, x2: Math.max(A.l, B.l), y2: cy, label: dist(A.l - B.l) });
    if (A.r !== B.r) lines.push({ x1: Math.min(A.r, B.r), y1: cy, x2: Math.max(A.r, B.r), y2: cy, label: dist(A.r - B.r) });
  }
  return lines;
}
