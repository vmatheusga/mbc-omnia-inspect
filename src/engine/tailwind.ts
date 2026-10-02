import { parseColor } from "./color";
import type { TokenIndex } from "./knowledge";

export interface ParsedClass {
  raw: string;
  /** Prefixos de variante: `hover`, `focus-visible`, `md`, `data-[state=on]`, `[&_svg]`… */
  modifiers: string[];
  important: boolean;
  negative: boolean;
  /** Utility completa sem modificadores, ex.: `bg-primary/90`. */
  base: string;
}

export type ClassKind =
  | "color"
  | "radius"
  | "font-size"
  | "font-weight"
  | "font-family"
  | "line-height"
  | "letter-spacing"
  | "shadow"
  | "spacing"
  | "size"
  | "opacity";

export interface ClassMeaning {
  cls: ParsedClass;
  kind: ClassKind;
  /** Propriedade lógica, ex.: `background-color`, `padding-x`, `border-radius`. */
  property: string;
  /** Propriedades computadas afetadas. */
  affects: string[];
  token?: string;
  /** Nome da utility (sem prefixo), ex.: `primary`, `md`, `4`. */
  name: string;
  alpha?: number;
  /** Valor arbitrário `[...]`, se houver. */
  arbitrary?: string;
  /** Cor da paleta padrão do Tailwind (não Omnia). */
  tailwindPalette?: boolean;
  /** Cor/tamanho desconhecido pelo DS. */
  unknown?: boolean;
  /** Valor em px quando aplicável (escala). */
  px?: number;
}

/** Separa `hover:md:bg-primary/90` respeitando colchetes/parênteses. */
export function parseClass(raw: string): ParsedClass {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of raw) {
    if (ch === "[" || ch === "(") depth++;
    if (ch === "]" || ch === ")") depth--;
    if (ch === ":" && depth === 0) {
      parts.push(current);
      current = "";
    } else current += ch;
  }
  parts.push(current);
  let base = parts.pop() ?? "";
  let important = false;
  if (base.startsWith("!")) {
    important = true;
    base = base.slice(1);
  } else if (base.endsWith("!")) {
    important = true;
    base = base.slice(0, -1);
  }
  let negative = false;
  if (base.startsWith("-")) {
    negative = true;
    base = base.slice(1);
  }
  return { raw, modifiers: parts, important, negative, base };
}

const TW_PALETTE =
  /^(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|mauve|olive|mist|taupe)-(50|100|200|300|400|500|600|700|800|900|950)$/;

const COLOR_PREFIXES: Record<string, { property: string; affects: string[] }> = {
  bg: { property: "background-color", affects: ["background-color"] },
  text: { property: "color", affects: ["color"] },
  border: { property: "border-color", affects: ["border-top-color", "border-right-color", "border-bottom-color", "border-left-color"] },
  "border-x": { property: "border-color", affects: ["border-left-color", "border-right-color"] },
  "border-y": { property: "border-color", affects: ["border-top-color", "border-bottom-color"] },
  "border-t": { property: "border-color", affects: ["border-top-color"] },
  "border-r": { property: "border-color", affects: ["border-right-color"] },
  "border-b": { property: "border-color", affects: ["border-bottom-color"] },
  "border-l": { property: "border-color", affects: ["border-left-color"] },
  ring: { property: "ring-color", affects: ["box-shadow"] },
  "ring-offset": { property: "ring-offset-color", affects: ["box-shadow"] },
  outline: { property: "outline-color", affects: ["outline-color"] },
  fill: { property: "fill", affects: ["fill"] },
  stroke: { property: "stroke", affects: ["stroke"] },
  placeholder: { property: "placeholder-color", affects: [] },
  divide: { property: "divide-color", affects: [] },
  decoration: { property: "text-decoration-color", affects: ["text-decoration-color"] },
  from: { property: "gradient-from", affects: ["background-image"] },
  via: { property: "gradient-via", affects: ["background-image"] },
  to: { property: "gradient-to", affects: ["background-image"] },
  shadow: { property: "shadow-color", affects: ["box-shadow"] },
  caret: { property: "caret-color", affects: ["caret-color"] },
  accent: { property: "accent-color", affects: ["accent-color"] },
};

const SPACING_PREFIXES: Record<string, { property: string; affects: string[] }> = {
  p: { property: "padding", affects: ["padding-top", "padding-right", "padding-bottom", "padding-left"] },
  px: { property: "padding-x", affects: ["padding-left", "padding-right"] },
  py: { property: "padding-y", affects: ["padding-top", "padding-bottom"] },
  pt: { property: "padding-top", affects: ["padding-top"] },
  pr: { property: "padding-right", affects: ["padding-right"] },
  pb: { property: "padding-bottom", affects: ["padding-bottom"] },
  pl: { property: "padding-left", affects: ["padding-left"] },
  ps: { property: "padding-left", affects: ["padding-left"] },
  pe: { property: "padding-right", affects: ["padding-right"] },
  m: { property: "margin", affects: ["margin-top", "margin-right", "margin-bottom", "margin-left"] },
  mx: { property: "margin-x", affects: ["margin-left", "margin-right"] },
  my: { property: "margin-y", affects: ["margin-top", "margin-bottom"] },
  mt: { property: "margin-top", affects: ["margin-top"] },
  mr: { property: "margin-right", affects: ["margin-right"] },
  mb: { property: "margin-bottom", affects: ["margin-bottom"] },
  ml: { property: "margin-left", affects: ["margin-left"] },
  ms: { property: "margin-left", affects: ["margin-left"] },
  me: { property: "margin-right", affects: ["margin-right"] },
  gap: { property: "gap", affects: ["row-gap", "column-gap"] },
  "gap-x": { property: "column-gap", affects: ["column-gap"] },
  "gap-y": { property: "row-gap", affects: ["row-gap"] },
  "space-x": { property: "space-x", affects: [] },
  "space-y": { property: "space-y", affects: [] },
};

const SIZE_PREFIXES: Record<string, { property: string; affects: string[] }> = {
  h: { property: "height", affects: ["height"] },
  w: { property: "width", affects: ["width"] },
  size: { property: "size", affects: ["width", "height"] },
  "min-h": { property: "min-height", affects: ["min-height"] },
  "min-w": { property: "min-width", affects: ["min-width"] },
  "max-h": { property: "max-height", affects: ["max-height"] },
  "max-w": { property: "max-width", affects: ["max-width"] },
};

const RADIUS_SIDES: Record<string, string[]> = {
  "": ["border-top-left-radius", "border-top-right-radius", "border-bottom-right-radius", "border-bottom-left-radius"],
  t: ["border-top-left-radius", "border-top-right-radius"],
  r: ["border-top-right-radius", "border-bottom-right-radius"],
  b: ["border-bottom-right-radius", "border-bottom-left-radius"],
  l: ["border-top-left-radius", "border-bottom-left-radius"],
  s: ["border-top-left-radius", "border-bottom-left-radius"],
  e: ["border-top-right-radius", "border-bottom-right-radius"],
  tl: ["border-top-left-radius"],
  tr: ["border-top-right-radius"],
  br: ["border-bottom-right-radius"],
  bl: ["border-bottom-left-radius"],
  ss: ["border-top-left-radius"],
  se: ["border-top-right-radius"],
  ee: ["border-bottom-right-radius"],
  es: ["border-bottom-left-radius"],
};

/** Escala de espaçamento "clássica" (múltiplos de --spacing = 4px). */
export const SPACING_SCALE = [
  0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 16, 20, 24, 28, 32, 36, 40, 44,
  48, 52, 56, 60, 64, 72, 80, 96,
];

export const LEADING_NAMED: Record<string, number> = {
  none: 1,
  tight: 1.25,
  snug: 1.375,
  normal: 1.5,
  relaxed: 1.625,
  loose: 2,
};

const WEIGHT_DEFAULTS: Record<string, number> = {
  thin: 100,
  extralight: 200,
  light: 300,
  normal: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
  extrabold: 800,
  black: 900,
};

function splitAlpha(value: string): { name: string; alpha?: number } {
  const m = value.match(/^(.*?)\/(\d+(?:\.\d+)?|\[[^\]]+\])$/);
  if (!m) return { name: value };
  const raw = m[2].replace(/^\[|\]$/g, "");
  const alpha = raw.endsWith("%") ? parseFloat(raw) / 100 : parseFloat(raw) > 1 ? parseFloat(raw) / 100 : parseFloat(raw);
  return { name: m[1], alpha };
}

const arbitraryOf = (v: string) => (v.startsWith("[") && v.endsWith("]") ? v.slice(1, -1) : undefined);

function matchPrefix<T>(base: string, table: Record<string, T>): [string, string, T] | null {
  // prefixo mais longo primeiro (border-x antes de border)
  const keys = Object.keys(table).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    if (base.startsWith(key + "-")) return [key, base.slice(key.length + 1), table[key]];
  }
  return null;
}

const looksLikeColor = (v: string) =>
  /^(#|rgb|hsl|oklch|oklab|color\(|var\(--)/.test(v) || parseColor(v) !== null;

/** Interpreta uma classe Tailwind em termos de token/propriedade. */
export function interpretClass(raw: string, index: TokenIndex): ClassMeaning | null {
  const cls = parseClass(raw);
  const base = cls.base;

  // --- Raio --------------------------------------------------------------
  const radius = base.match(/^rounded(?:-(t|r|b|l|s|e|tl|tr|br|bl|ss|se|ee|es))?(?:-(.+))?$/);
  if (radius) {
    const side = radius[1] ?? "";
    const name = radius[2] ?? "";
    const arbitrary = arbitraryOf(name);
    const token = index.radius.find((r) => r.utility === name);
    const px =
      token?.px ??
      (name === "full" ? 9999 : name === "none" ? 0 : name === "" ? 4 : arbitrary ? parseFloat(arbitrary) : undefined);
    return {
      cls,
      kind: "radius",
      property: "border-radius",
      affects: RADIUS_SIDES[side] ?? RADIUS_SIDES[""],
      token: token?.name,
      name: name || "DEFAULT",
      arbitrary,
      px,
      unknown: !token && !["full", "none"].includes(name) && !arbitrary,
    };
  }

  // --- Sombra ------------------------------------------------------------
  if (base === "shadow" || /^shadow-(2xs|xs|sm|md|lg|xl|2xl|none|\[.+\])$/.test(base)) {
    const name = base === "shadow" ? "DEFAULT" : base.slice(7);
    const token = index.shadows.find((s) => s.utility === name);
    return {
      cls,
      kind: "shadow",
      property: "box-shadow",
      affects: ["box-shadow"],
      token: token?.name,
      name,
      arbitrary: arbitraryOf(name),
      unknown: !token && name !== "none" && !arbitraryOf(name),
    };
  }

  // --- Tipografia --------------------------------------------------------
  if (base.startsWith("text-")) {
    const { name, alpha } = splitAlpha(base.slice(5));
    const text = index.text.find((t) => t.utility === name);
    if (text) {
      return { cls, kind: "font-size", property: "font-size", affects: ["font-size", "line-height"], token: text.name, name, px: text.px };
    }
    const arbitrary = arbitraryOf(name);
    if (arbitrary && !looksLikeColor(arbitrary.replace(/^color:/, ""))) {
      return { cls, kind: "font-size", property: "font-size", affects: ["font-size"], name, arbitrary, px: parseFloat(arbitrary) };
    }
    if (/^(left|right|center|justify|start|end|wrap|nowrap|balance|pretty|ellipsis|clip)$/.test(name)) return null;
    return colorMeaning(cls, "text", name, alpha, index);
  }
  if (base.startsWith("font-")) {
    const name = base.slice(5);
    const weight = index.weights.find((w) => w.utility === name);
    if (weight || WEIGHT_DEFAULTS[name]) {
      return {
        cls,
        kind: "font-weight",
        property: "font-weight",
        affects: ["font-weight"],
        token: weight?.name,
        name,
        px: weight?.value ?? WEIGHT_DEFAULTS[name],
        unknown: !weight,
      };
    }
    const font = index.fonts.find((f) => f.utility === name);
    if (font || name === "mono" || arbitraryOf(name)) {
      return { cls, kind: "font-family", property: "font-family", affects: ["font-family"], token: font?.name, name, arbitrary: arbitraryOf(name) };
    }
    return null;
  }
  if (base.startsWith("leading-")) {
    const name = base.slice(8);
    return {
      cls,
      kind: "line-height",
      property: "line-height",
      affects: ["line-height"],
      name,
      arbitrary: arbitraryOf(name),
      px: /^\d+(\.\d+)?$/.test(name) ? parseFloat(name) * 4 : undefined,
    };
  }
  if (base.startsWith("tracking-")) {
    const name = base.slice(9);
    return { cls, kind: "letter-spacing", property: "letter-spacing", affects: ["letter-spacing"], name, arbitrary: arbitraryOf(name) };
  }
  if (base.startsWith("opacity-")) {
    const name = base.slice(8);
    return { cls, kind: "opacity", property: "opacity", affects: ["opacity"], name, arbitrary: arbitraryOf(name) };
  }

  // --- Espaçamento e tamanho --------------------------------------------
  const spacing = matchPrefix(base, SPACING_PREFIXES);
  if (spacing) {
    const [, name, def] = spacing;
    return spacingMeaning(cls, "spacing", def.property, def.affects, name);
  }
  const size = matchPrefix(base, SIZE_PREFIXES);
  if (size) {
    const [, name, def] = size;
    return spacingMeaning(cls, "size", def.property, def.affects, name);
  }

  // --- Cores (demais prefixos) -------------------------------------------
  const color = matchPrefix(base, COLOR_PREFIXES);
  if (color) {
    const [prefix, value] = color;
    // border-2, ring-2, outline-offset-2 etc. não são cores
    if (/^(\d+|px|offset.*|none|solid|dashed|dotted|double|hidden|inset|\[\d.*\])$/.test(value)) return null;
    if (prefix === "shadow" && /^(2xs|xs|sm|md|lg|xl|2xl|none)$/.test(value)) return null;
    const { name, alpha } = splitAlpha(value);
    return colorMeaning(cls, prefix, name, alpha, index);
  }
  return null;
}

function spacingMeaning(
  cls: ParsedClass,
  kind: "spacing" | "size",
  property: string,
  affects: string[],
  name: string,
): ClassMeaning {
  const arbitrary = arbitraryOf(name);
  let px: number | undefined;
  if (name === "px") px = 1;
  else if (/^\d+(\.\d+)?$/.test(name)) px = parseFloat(name) * 4;
  else if (arbitrary && /^-?\d+(\.\d+)?(px|rem)$/.test(arbitrary)) px = arbitrary.endsWith("rem") ? parseFloat(arbitrary) * 16 : parseFloat(arbitrary);
  return { cls, kind, property, affects, name, arbitrary, px, token: px !== undefined && !arbitrary ? "--spacing" : undefined };
}

/** Utilities com prefixo de cor que não são cores (bg-clip-*, border-collapse…). */
const NON_COLOR_VALUES =
  /^(clip-.*|origin-.*|fixed|local|scroll|repeat.*|no-repeat|cover|contain|auto|center|top|bottom|left|right|left-.*|right-.*|none|linear.*|radial.*|conic.*|gradient.*|blend-.*|collapse|separate|spacing-.*|solid|dashed|dotted|double|wavy|hidden|from-font|shadow.*|opacity-.*|x|y|reverse|position|size|image|attachment)$/;

function colorMeaning(
  cls: ParsedClass,
  prefix: string,
  name: string,
  alpha: number | undefined,
  index: TokenIndex,
): ClassMeaning | null {
  const def = COLOR_PREFIXES[prefix];
  if (!def) return null;
  if (NON_COLOR_VALUES.test(name)) return null;
  const arbitrary = arbitraryOf(name);
  const token = index.colorByUtility.get(name);
  const special = ["transparent", "current", "inherit", "white", "black"].includes(name);
  const tailwindPalette = TW_PALETTE.test(name);
  if (!token && !special && !tailwindPalette && !arbitrary && !/^[a-z]/.test(name)) return null;
  return {
    cls,
    kind: "color",
    property: def.property,
    affects: def.affects,
    token: token?.name,
    name,
    alpha,
    arbitrary,
    tailwindPalette,
    unknown: !token && !special && !tailwindPalette && !arbitrary,
  };
}

/** Breakpoints padrão do Tailwind v4 (o Omnia não sobrescreve). */
export const BREAKPOINTS: Record<string, number> = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  "2xl": 1536,
};

const isBreakpoint = (m: string) => m in BREAKPOINTS || /^max-(sm|md|lg|xl|2xl)$/.test(m) || /^(min|max)-\[.+\]$/.test(m);

function arbitraryWidth(m: string): number | undefined {
  const v = m.match(/^(?:min|max)-\[(.+)\]$/)?.[1];
  if (!v) return undefined;
  return v.endsWith("rem") ? parseFloat(v) * 16 : parseFloat(v);
}

/** O modificador de breakpoint está ativo nesta largura? */
export function breakpointActive(m: string, viewportWidth: number): boolean {
  if (m in BREAKPOINTS) return viewportWidth >= BREAKPOINTS[m];
  const max = m.match(/^max-(sm|md|lg|xl|2xl)$/)?.[1];
  if (max) return viewportWidth < BREAKPOINTS[max];
  const arbitrary = arbitraryWidth(m);
  if (arbitrary !== undefined) return m.startsWith("min") ? viewportWidth >= arbitrary : viewportWidth < arbitrary;
  return true;
}

/** Nome do breakpoint atual (`base` abaixo de sm). */
export function currentBreakpoint(viewportWidth: number): string {
  let current = "base";
  for (const [name, min] of Object.entries(BREAKPOINTS)) if (viewportWidth >= min) current = name;
  return current;
}

/** Modificadores que representam estados (e não breakpoints/tema). */
export function stateOf(modifiers: string[]): string | null {
  const relevant = modifiers.filter((m) => !isBreakpoint(m) && m !== "dark" && !m.startsWith("@"));
  return relevant.length ? relevant.join(":") : null;
}

/** Aplica-se ao elemento agora (breakpoints ativos, tema, sem hover/focus)? */
export function isBaseState(cls: ParsedClass, theme: "light" | "dark", viewportWidth = 1280): boolean {
  return cls.modifiers.every(
    (m) =>
      (isBreakpoint(m) && breakpointActive(m, viewportWidth)) ||
      m.startsWith("@") ||
      (m === "dark" && theme === "dark"),
  );
}

/** Classes com modificadores de breakpoint, agrupadas. */
export function responsiveRules(classes: string[], viewportWidth: number) {
  const groups = new Map<string, { breakpoint: string; width: number; active: boolean; classes: string[] }>();
  for (const raw of classes) {
    const cls = parseClass(raw);
    const bp = cls.modifiers.find(isBreakpoint);
    if (!bp) continue;
    const width = BREAKPOINTS[bp] ?? BREAKPOINTS[bp.replace(/^max-/, "")] ?? arbitraryWidth(bp) ?? 0;
    const group = groups.get(bp) ?? { breakpoint: bp, width, active: breakpointActive(bp, viewportWidth), classes: [] };
    group.classes.push(raw);
    groups.set(bp, group);
  }
  return [...groups.values()].sort((a, b) => a.width - b.width);
}
