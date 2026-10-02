/** Cor normalizada em sRGB (0–255) com alpha (0–1). */
export interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

const NAMED: Record<string, RGBA> = {
  transparent: { r: 0, g: 0, b: 0, a: 0 },
  white: { r: 255, g: 255, b: 255, a: 1 },
  black: { r: 0, g: 0, b: 0, a: 1 },
  currentcolor: { r: 0, g: 0, b: 0, a: 1 },
};

const clamp = (v: number, min = 0, max = 255) => Math.min(max, Math.max(min, v));

function parseNumber(token: string, scale = 1): number {
  const t = token.trim();
  if (t === "none") return 0;
  if (t.endsWith("%")) return (parseFloat(t) / 100) * scale;
  return parseFloat(t);
}

/** Separa componentes aceitando sintaxe com vírgula ou espaço e `/ alpha`. */
function splitArgs(inner: string): { parts: string[]; alpha?: string } {
  const [main, alpha] = inner.split("/");
  const parts = main.includes(",")
    ? main.split(",").map((p) => p.trim())
    : main.trim().split(/\s+/);
  if (!alpha && parts.length === 4) return { parts: parts.slice(0, 3), alpha: parts[3] };
  return { parts, alpha: alpha?.trim() };
}

const srgbToLinear = (c: number) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
};
const linearToSrgb = (v: number) => {
  const c = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
  return clamp(Math.round(c * 255));
};

export function oklabToRgb(L: number, a: number, b: number, alpha = 1): RGBA {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;
  return {
    r: linearToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    g: linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    b: linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
    a: alpha,
  };
}

export function rgbToOklab({ r, g, b }: RGBA): [number, number, number] {
  const lr = srgbToLinear(r);
  const lg = srgbToLinear(g);
  const lb = srgbToLinear(b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function hslToRgb(h: number, s: number, l: number, a: number): RGBA {
  const k = (n: number) => (n + h / 30) % 12;
  const f = (n: number) => l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return { r: Math.round(f(0) * 255), g: Math.round(f(8) * 255), b: Math.round(f(4) * 255), a };
}

export function parseColor(input: string | undefined | null): RGBA | null {
  if (!input) return null;
  const value = input.trim().toLowerCase();
  if (NAMED[value]) return { ...NAMED[value] };

  if (value.startsWith("#")) {
    let hex = value.slice(1);
    if (hex.length === 3 || hex.length === 4) hex = [...hex].map((c) => c + c).join("");
    if (hex.length !== 6 && hex.length !== 8) return null;
    const n = parseInt(hex, 16);
    if (Number.isNaN(n)) return null;
    return hex.length === 6
      ? { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 }
      : {
          r: parseInt(hex.slice(0, 2), 16),
          g: parseInt(hex.slice(2, 4), 16),
          b: parseInt(hex.slice(4, 6), 16),
          a: parseInt(hex.slice(6, 8), 16) / 255,
        };
  }

  const fn = value.match(/^([a-z]+)\((.*)\)$/);
  if (!fn) return null;
  const [, name, inner] = fn;

  if (name === "rgb" || name === "rgba") {
    const { parts, alpha } = splitArgs(inner);
    return {
      r: clamp(parseNumber(parts[0], 255)),
      g: clamp(parseNumber(parts[1], 255)),
      b: clamp(parseNumber(parts[2], 255)),
      a: alpha ? clamp(parseNumber(alpha, 1), 0, 1) : 1,
    };
  }
  if (name === "hsl" || name === "hsla") {
    const { parts, alpha } = splitArgs(inner);
    return hslToRgb(
      parseFloat(parts[0]),
      parseNumber(parts[1], 1),
      parseNumber(parts[2], 1),
      alpha ? parseNumber(alpha, 1) : 1,
    );
  }
  if (name === "oklab") {
    const { parts, alpha } = splitArgs(inner);
    return oklabToRgb(
      parseNumber(parts[0], 1),
      parseNumber(parts[1], 0.4),
      parseNumber(parts[2], 0.4),
      alpha ? parseNumber(alpha, 1) : 1,
    );
  }
  if (name === "oklch") {
    const { parts, alpha } = splitArgs(inner);
    const L = parseNumber(parts[0], 1);
    const C = parseNumber(parts[1], 0.4);
    const H = (parseFloat(parts[2]) * Math.PI) / 180 || 0;
    return oklabToRgb(L, C * Math.cos(H), C * Math.sin(H), alpha ? parseNumber(alpha, 1) : 1);
  }
  if (name === "color") {
    const { parts, alpha } = splitArgs(inner);
    const [space, ...rest] = parts;
    if (space !== "srgb") return null;
    return {
      r: clamp(Math.round(parseNumber(rest[0], 1) * 255)),
      g: clamp(Math.round(parseNumber(rest[1], 1) * 255)),
      b: clamp(Math.round(parseNumber(rest[2], 1) * 255)),
      a: alpha ? parseNumber(alpha, 1) : 1,
    };
  }
  return null;
}

export const isTransparent = (c: RGBA | null) => !c || c.a < 0.01;

/** Mesma cor ignorando alpha. */
export function toOpaque(c: RGBA): RGBA {
  return { ...c, a: 1 };
}

/** Distância perceptual (ΔE OKLab × 100). ~<1 imperceptível, ~<3 muito próximo. */
export function deltaE(a: RGBA, b: RGBA): number {
  const [l1, a1, b1] = rgbToOklab(a);
  const [l2, a2, b2] = rgbToOklab(b);
  const alphaDiff = (a.a - b.a) * 10;
  return Math.sqrt((l1 - l2) ** 2 + (a1 - a2) ** 2 + (b1 - b2) ** 2) * 100 + Math.abs(alphaDiff);
}

/** Compõe `fg` sobre `bg` (bg assumido opaco). */
export function blend(fg: RGBA, bg: RGBA): RGBA {
  const a = fg.a;
  return {
    r: Math.round(fg.r * a + bg.r * (1 - a)),
    g: Math.round(fg.g * a + bg.g * (1 - a)),
    b: Math.round(fg.b * a + bg.b * (1 - a)),
    a: 1,
  };
}

export function luminance(c: RGBA): number {
  return 0.2126 * srgbToLinear(c.r) + 0.7152 * srgbToLinear(c.g) + 0.0722 * srgbToLinear(c.b);
}

export function contrastRatio(fg: RGBA, bg: RGBA): number {
  const base = bg.a < 1 ? blend(bg, { r: 255, g: 255, b: 255, a: 1 }) : bg;
  const front = fg.a < 1 ? blend(fg, base) : fg;
  const l1 = luminance(front);
  const l2 = luminance(base);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

const hex2 = (n: number) => Math.round(n).toString(16).padStart(2, "0");

export function toHex(c: RGBA): string {
  const base = `#${hex2(c.r)}${hex2(c.g)}${hex2(c.b)}`;
  return c.a < 1 ? `${base}${hex2(c.a * 255)}` : base;
}

/** Texto amigável: `#11181c` ou `#11181c · 90%`. */
export function formatColor(c: RGBA): string {
  const base = `#${hex2(c.r)}${hex2(c.g)}${hex2(c.b)}`;
  return c.a < 1 ? `${base} · ${Math.round(c.a * 100)}%` : base;
}

export function toCss(c: RGBA): string {
  return c.a < 1 ? `rgb(${c.r} ${c.g} ${c.b} / ${+c.a.toFixed(3)})` : `rgb(${c.r} ${c.g} ${c.b})`;
}

export function toHsl(c: RGBA): string {
  const r = c.r / 255;
  const g = c.g / 255;
  const b = c.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
  }
  const base = `${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
  return c.a < 1 ? `hsl(${base} / ${+c.a.toFixed(2)})` : `hsl(${base})`;
}

export type ColorFormat = "hex" | "rgb" | "hsl";

export function formatColorAs(value: string, format: ColorFormat): string {
  const c = parseColor(value);
  if (!c) return value;
  if (format === "rgb") return toCss(c);
  if (format === "hsl") return toHsl(c);
  return toHex(c).toUpperCase();
}
