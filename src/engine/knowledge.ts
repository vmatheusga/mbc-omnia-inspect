import { parseColor, type RGBA } from "./color";
import type {
  DesignSystemKnowledge,
  Knowledge,
  PageContext,
  SlotDef,
  Theme,
  TokenDef,
  VariantConfig,
} from "./types";

// ---------------------------------------------------------------------------
// Tokens resolvidos para a página atual (tema + overrides vivos)
// ---------------------------------------------------------------------------

export interface ColorToken {
  name: string;
  utility?: string;
  rgba: RGBA;
  primitive: boolean;
}

export interface LengthToken {
  name: string;
  utility: string;
  px: number;
  lineHeight?: number;
}

export interface ShadowLayer {
  x: number;
  y: number;
  blur: number;
  spread: number;
  inset: boolean;
  color: RGBA;
}

export interface ShadowToken {
  name: string;
  utility: string;
  layers: ShadowLayer[];
}

export interface TokenIndex {
  theme: Theme;
  rootFontSize: number;
  colors: ColorToken[];
  colorByUtility: Map<string, ColorToken>;
  radius: LengthToken[];
  text: LengthToken[];
  weights: Array<{ name: string; utility: string; value: number }>;
  fonts: Array<{ name: string; utility: string; value: string; first: string }>;
  shadows: ShadowToken[];
}

/** Utilities de cor que só existem no Omnia (não no shadcn padrão). */
const SHADCN_STANDARD_COLORS = new Set([
  "background",
  "foreground",
  "card",
  "card-foreground",
  "popover",
  "popover-foreground",
  "primary",
  "primary-foreground",
  "secondary",
  "secondary-foreground",
  "muted",
  "muted-foreground",
  "accent",
  "accent-foreground",
  "destructive",
  "destructive-foreground",
  "border",
  "input",
  "ring",
  "sidebar",
  "sidebar-foreground",
  "sidebar-border",
  "sidebar-accent",
  "sidebar-accent-foreground",
  "sidebar-ring",
  "sidebar-primary",
  "sidebar-primary-foreground",
]);

export function remToPx(value: string, rootFontSize = 16): number {
  const v = value.trim();
  if (v.endsWith("rem")) return parseFloat(v) * rootFontSize;
  if (v.endsWith("px")) return parseFloat(v);
  if (v.endsWith("em")) return parseFloat(v) * rootFontSize;
  return parseFloat(v);
}

/** Separa por vírgulas de nível 0 (fora de parênteses). */
export function splitTopLevel(value: string, sep = ","): string[] {
  const out: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of value) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === sep && depth === 0) {
      out.push(current.trim());
      current = "";
    } else current += ch;
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

export function parseShadow(value: string | undefined, rootFontSize = 16): ShadowLayer[] {
  if (!value || value === "none") return [];
  return splitTopLevel(value)
    .map((layer) => {
      const colorMatch = layer.match(/(rgba?\([^)]*\)|oklab\([^)]*\)|oklch\([^)]*\)|color\([^)]*\)|#[0-9a-f]{3,8})/i);
      const color = parseColor(colorMatch?.[0]) ?? { r: 0, g: 0, b: 0, a: 1 };
      const rest = colorMatch ? layer.replace(colorMatch[0], " ") : layer;
      const inset = /\binset\b/.test(rest);
      const nums = rest
        .replace(/\binset\b/, " ")
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map((n) => remToPx(n, rootFontSize));
      const [x = 0, y = 0, blur = 0, spread = 0] = nums;
      return { x, y, blur, spread, inset, color };
    })
    .filter((l) => !(l.color.a < 0.01 && !l.x && !l.y && !l.blur && !l.spread));
}

export function buildTokenIndex(knowledge: Knowledge, page: PageContext): TokenIndex {
  const { theme, rootFontSize, tokenValues } = page;
  const index: TokenIndex = {
    theme,
    rootFontSize,
    colors: [],
    colorByUtility: new Map(),
    radius: [],
    text: [],
    weights: [],
    fonts: [],
    shadows: [],
  };

  const valueOf = (t: TokenDef) => {
    const live = tokenValues[t.name]?.trim();
    if (live) return live;
    return theme === "dark" ? (t.dark ?? t.light) : t.light;
  };

  for (const t of knowledge.tokens) {
    const value = valueOf(t);
    if (!value) continue;
    switch (t.kind) {
      case "color":
      case "primitive-color": {
        const rgba = parseColor(value);
        if (!rgba) break;
        const token: ColorToken = {
          name: t.name,
          utility: t.utility,
          rgba,
          primitive: t.kind === "primitive-color",
        };
        index.colors.push(token);
        if (t.utility) index.colorByUtility.set(t.utility, token);
        break;
      }
      case "radius":
        index.radius.push({ name: t.name, utility: t.utility!, px: remToPx(value, rootFontSize) });
        break;
      case "text":
        index.text.push({
          name: t.name,
          utility: t.utility!,
          px: remToPx(value, rootFontSize),
          lineHeight: t.lineHeight ? parseFloat(t.lineHeight) : undefined,
        });
        break;
      case "weight":
        index.weights.push({ name: t.name, utility: t.utility!, value: parseFloat(value) });
        break;
      case "font": {
        const first = splitTopLevel(value)[0]?.replace(/["']/g, "").trim() ?? "";
        index.fonts.push({ name: t.name, utility: t.utility!, value, first });
        break;
      }
      case "shadow":
        index.shadows.push({
          name: t.name,
          utility: t.utility!,
          layers: parseShadow(value, rootFontSize),
        });
        break;
    }
  }
  return index;
}

export function isOmniaOnlyColor(utility: string): boolean {
  return !SHADCN_STANDARD_COLORS.has(utility);
}

/** A página declara variáveis que só existem no Omnia? */
export function pageUsesOmniaTokens(page: PageContext): boolean {
  const markers = ["--body-background", "--foreground-alt", "--brand", "--input-background"];
  return markers.filter((m) => page.tokenValues[m]?.trim()).length >= 2;
}

// ---------------------------------------------------------------------------
// Componentes
// ---------------------------------------------------------------------------

export interface DesignSystemIndex {
  ds: DesignSystemKnowledge;
  parts: Set<string>;
  families: Set<string>;
}

export interface KnowledgeIndex {
  raw: Knowledge;
  omnia: DesignSystemIndex;
  shadcn: DesignSystemIndex[];
}

const indexDs = (ds: DesignSystemKnowledge): DesignSystemIndex => ({
  ds,
  parts: new Set(ds.signatures.map((s) => s.part).concat(Object.values(ds.slots).map((s) => s.part))),
  families: new Set(Object.values(ds.slots).map((s) => s.family).concat(ds.signatures.map((s) => s.family))),
});

export function buildKnowledgeIndex(knowledge: Knowledge): KnowledgeIndex {
  return {
    raw: knowledge,
    omnia: indexDs(knowledge.omnia),
    shadcn: knowledge.shadcn.map(indexDs),
  };
}

export function variantConfigFor(ds: DesignSystemKnowledge, def: SlotDef): VariantConfig | undefined {
  return def.variants ? ds.variantConfigs[def.variants] : undefined;
}

/** Classes base do componente (slot + base do cva). */
export function baseClassesFor(ds: DesignSystemKnowledge, def: SlotDef): string[] {
  const config = variantConfigFor(ds, def);
  return [...def.baseClasses, ...(config?.base ?? [])];
}

/** Todas as classes que o componente pode aplicar (base + todas as opções). */
export function allComponentClasses(ds: DesignSystemKnowledge, def: SlotDef): Set<string> {
  const config = variantConfigFor(ds, def);
  const all = new Set(baseClassesFor(ds, def));
  if (config) {
    for (const options of Object.values(config.variants)) {
      for (const classes of Object.values(options)) classes.forEach((c) => all.add(c));
    }
  }
  return all;
}

export function kebab(name: string): string {
  return name.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

export function pascal(name: string): string {
  return name
    .split(/[-_\s]/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join("");
}
