import { parseClass } from "./tailwind";
import { currentBreakpoint } from "./tailwind";
import type { BoxModel, ElementSnapshot, TokenUsage } from "./types";

/**
 * Propriedades no formato do Figma Dev Mode: seções com linhas (lista) e
 * declarações CSS (código). Valores são estruturados para o painel converter
 * unidade (px/rem) e formato de cor (Hex/RGB/HSL).
 */

export type ValuePart = string | { px: number } | { color: string };
export type Value = ValuePart[];

export interface PropertyRow {
  label: string;
  value: Value;
  token?: string;
  utility?: string;
  swatch?: string;
  source?: TokenUsage["source"];
}

export interface CssDecl {
  prop: string;
  value: Value;
  /** Valor com token, ex.: `var(--primary)`, `calc(var(--spacing) * 4)`. */
  token?: string;
}

export type SectionId = "layout" | "modos" | "cores" | "tipografia" | "aparencia";

export interface PropertySection {
  id: SectionId;
  title: string;
  rows: PropertyRow[];
  css: CssDecl[];
  tailwind: string[];
  /** Seções só informativas (sem código), como Modos. */
  listOnly?: boolean;
}

const px = (v: string | undefined) => parseFloat(v ?? "") || 0;
const round = (n: number) => Math.round(n * 100) / 100;

const ALIGN: Record<string, string> = {
  "flex-start": "Início",
  start: "Início",
  normal: "Padrão",
  center: "Centro",
  "flex-end": "Fim",
  end: "Fim",
  "space-between": "Espaço entre",
  "space-around": "Espaço ao redor",
  "space-evenly": "Espaço uniforme",
  stretch: "Esticar",
  baseline: "Linha de base",
};

const TRANSFORM: Record<string, string> = { uppercase: "MAIÚSCULAS", lowercase: "minúsculas", capitalize: "Primeira Maiúscula" };
const TEXT_ALIGN: Record<string, string> = { left: "Esquerda", start: "Esquerda", center: "Centro", right: "Direita", end: "Direita", justify: "Justificado" };

// Classificação de classes Tailwind por seção
const TW_SECTIONS: Array<[SectionId, RegExp]> = [
  ["cores", /^(bg|text|border|ring|outline|fill|stroke|from|via|to|decoration|caret|accent|placeholder)-(?!\d|\[\d|xs$|sm$|base$|lg$|xl$|\dxl$|2xs$|left$|right$|center$|justify$|start$|end$|x$|y$|t$|r$|b$|l$|solid$|dashed$|dotted$|none$|clip|cover|contain|no-repeat|wrap|nowrap|balance|pretty|ellipsis)/],
  ["tipografia", /^(text-(xs|sm|base|lg|\d?xl|2xs|left|right|center|justify|start|end|wrap|nowrap|balance|pretty|ellipsis|\[\d)|font-|leading-|tracking-|uppercase|lowercase|capitalize|normal-case|italic|not-italic|underline|line-through|no-underline|truncate|line-clamp-|whitespace-|break-|antialiased)/],
  ["aparencia", /^(rounded|shadow|border$|border-(\d|x|y|t|r|b|l|s|e|solid|dashed|dotted|none|\[\d)|ring(-\d|$)|outline(-\d|$|-none|-offset)|opacity-|blur|backdrop-|transition|duration-|ease-|animate-)/],
  ["layout", /^(auto-(rows|cols)-|grid-flow-|flex|inline-flex|grid|inline-grid|block|inline-block|inline|hidden|contents|table|flow-root|items-|justify-|content-|self-|place-|gap-|space-[xy]-|grow|shrink|basis-|order-|col-|row-|w-|h-|size-|min-|max-|p[xytrblse]?-|m[xytrblse]?-|absolute|relative|fixed|sticky|static|inset|top-|right-|bottom-|left-|z-|overflow|aspect-|container|@container|object-|float-|clear-)/],
];

function tailwindFor(classes: string[]): Record<SectionId, string[]> {
  const out: Record<SectionId, string[]> = { layout: [], modos: [], cores: [], tipografia: [], aparencia: [] };
  for (const raw of classes) {
    const base = parseClass(raw).base.replace(/^-/, "");
    const section = TW_SECTIONS.find(([, re]) => re.test(base))?.[0];
    if (section) out[section].push(raw);
  }
  return out;
}

type Sizing = "Preenchimento" | "Envolver" | "Fixo" | "Automático";

/** Largura/altura no vocabulário do Figma: fill, hug ou fixed. */
function sizing(el: ElementSnapshot, axis: "width" | "height"): Sizing {
  const bases = el.classes.map((c) => parseClass(c).base);
  const s = el.styles;
  const parent = el.parentStyles ?? {};
  const size = axis === "width" ? el.rect.width : el.rect.height;
  const parentContent = px(parent[axis === "width" ? "content-width" : "content-height"]);
  const letter = axis === "width" ? "w" : "h";

  if (bases.some((b) => b === `${letter}-full` || b === `${letter}-screen`)) return "Preenchimento";
  if (bases.some((b) => ["flex-1", "grow", "flex-auto"].includes(b)) && b_isMain(parent, axis)) return "Preenchimento";
  if (bases.includes("self-stretch") && !b_isMain(parent, axis)) return "Preenchimento";
  if (bases.some((b) => b === `${letter}-fit` || b === `${letter}-auto` || b === `${letter}-max` || b === `${letter}-min`)) return "Envolver";
  if (bases.some((b) => new RegExp(`^(${letter}|size|min-${letter})-(\\d|\\[|px$)`).test(b))) return "Fixo";

  const parentFlex = /flex/.test(parent.display ?? "");
  const direction = parent["flex-direction"] ?? "row";
  const mainAxis = (direction.startsWith("row") && axis === "width") || (direction.startsWith("column") && axis === "height");
  if (parentFlex) {
    if (mainAxis) return px(s["flex-grow"]) > 0 ? "Preenchimento" : "Envolver";
    const stretch = (s["align-self"] === "stretch" || (s["align-self"] === "auto" && (parent["align-items"] ?? "normal").match(/stretch|normal/)));
    return stretch ? "Preenchimento" : "Envolver";
  }
  if (axis === "width") {
    if (/^inline/.test(s.display ?? "") || /absolute|fixed/.test(s.position ?? "")) return "Envolver";
    if (parentContent && Math.abs(size - parentContent) <= 1) return "Preenchimento";
    return "Fixo";
  }
  return "Envolver";
}

function b_isMain(parent: Record<string, string>, axis: "width" | "height") {
  const direction = parent["flex-direction"] ?? "row";
  return /flex/.test(parent.display ?? "")
    ? (direction.startsWith("row") && axis === "width") || (direction.startsWith("column") && axis === "height")
    : true;
}

function sides(values: number[]): Value {
  const [t, r, b, l] = values;
  if (t === r && r === b && b === l) return [{ px: t }];
  if (t === b && r === l) return [{ px: t }, " ", { px: r }];
  return [{ px: t }, " ", { px: r }, " ", { px: b }, " ", { px: l }];
}

function spacingToken(values: number[]): string | undefined {
  const uniq = [...new Set(values)];
  const steps = values.map((v) => v / 4);
  if (steps.some((s) => !Number.isInteger(s * 2))) return undefined;
  const parts = (uniq.length === 1 ? [values[0]] : values).map((v) => (v === 0 ? "0" : `calc(var(--spacing) * ${round(v / 4)})`));
  return parts.join(" ");
}

export interface PropertiesInput {
  el: ElementSnapshot;
  usages: TokenUsage[];
  box: BoxModel;
  theme: "light" | "dark";
  viewportWidth: number;
  usesOmniaTokens: boolean;
}

export function buildProperties({ el, usages, box, theme, viewportWidth, usesOmniaTokens }: PropertiesInput): PropertySection[] {
  const s = el.styles;
  const tw = tailwindFor(el.classes);
  const usage = (property: string) => usages.find((u) => u.property === property || u.property.startsWith(property));
  const sections: PropertySection[] = [];

  // ---------------------------------------------------------------- Layout
  {
    const rows: PropertyRow[] = [];
    const css: CssDecl[] = [];
    const display = s.display ?? "block";
    const isFlex = /flex/.test(display);
    const isGrid = /grid/.test(display);
    if (isFlex) {
      const dir = s["flex-direction"] ?? "row";
      const wrap = s["flex-wrap"] === "wrap";
      rows.push({ label: "Fluxo", value: [`${dir.startsWith("column") ? "Vertical" : "Horizontal"}${dir.endsWith("reverse") ? " (invertido)" : ""}${wrap ? " · quebra linha" : ""}`] });
      css.push({ prop: "display", value: [display] }, { prop: "flex-direction", value: [dir] });
      if (wrap) css.push({ prop: "flex-wrap", value: ["wrap"] });
    } else if (isGrid) {
      const cols = (s["grid-template-columns"] ?? "").split(/\s+(?![^(]*\))/).filter((c) => c && c !== "none").length;
      rows.push({ label: "Fluxo", value: [`Grade${cols ? ` · ${cols} coluna${cols > 1 ? "s" : ""}` : ""}`] });
      css.push({ prop: "display", value: [display] });
      if (s["grid-template-columns"] && s["grid-template-columns"] !== "none") css.push({ prop: "grid-template-columns", value: [s["grid-template-columns"]] });
    } else {
      const map: Record<string, string> = { block: "Bloco", inline: "Em linha", "inline-block": "Bloco em linha", none: "Oculto", contents: "Contents" };
      rows.push({ label: "Fluxo", value: [map[display] ?? display] });
      if (display !== "block") css.push({ prop: "display", value: [display] });
    }

    const w = sizing(el, "width");
    const h = sizing(el, "height");
    rows.push({ label: "Largura", value: [`${w} (`, { px: round(el.rect.width) }, ")"] });
    rows.push({ label: "Altura", value: [`${h} (`, { px: round(el.rect.height) }, ")"] });
    const parent = el.parentStyles ?? {};
    const parentRow = /flex/.test(parent.display ?? "") && (parent["flex-direction"] ?? "row").startsWith("row");
    for (const [axis, mode] of [["width", w], ["height", h]] as const) {
      const size = round(axis === "width" ? el.rect.width : el.rect.height);
      if (mode === "Fixo") css.push({ prop: axis, value: [{ px: size }] });
      if (mode === "Preenchimento") {
        const main = (axis === "width") === parentRow;
        if (/flex/.test(parent.display ?? "") && main) css.push({ prop: "flex", value: ["1 0 0"] });
        else if (/flex/.test(parent.display ?? "")) css.push({ prop: "align-self", value: ["stretch"] });
        else if (axis === "width") css.push({ prop: "width", value: ["100%"] });
      }
    }
    for (const prop of ["min-width", "max-width", "min-height", "max-height"]) {
      const v = s[prop];
      if (v && !["0px", "none", "auto"].includes(v)) {
        rows.push({ label: { "min-width": "Largura mín.", "max-width": "Largura máx.", "min-height": "Altura mín.", "max-height": "Altura máx." }[prop]!, value: /px$/.test(v) ? [{ px: px(v) }] : [v] });
        css.push({ prop, value: /px$/.test(v) ? [{ px: px(v) }] : [v] });
      }
    }

    if (isFlex || isGrid) {
      const rg = px(s["row-gap"]);
      const cg = px(s["column-gap"]);
      if (rg || cg) {
        const value: Value = rg === cg ? [{ px: rg }] : [{ px: rg }, " ", { px: cg }];
        const u = usage("gap");
        rows.push({ label: "Espaço", value, token: u?.token, utility: u?.utility, source: u?.source });
        css.push({ prop: "gap", value, token: spacingToken(rg === cg ? [rg] : [rg, cg]) });
      }
      const ai = s["align-items"];
      const jc = s["justify-content"];
      if ((ai && ai !== "normal") || (jc && jc !== "normal")) {
        rows.push({ label: "Alinhamento", value: [[ai && ai !== "normal" ? ALIGN[ai] ?? ai : null, jc && jc !== "normal" ? ALIGN[jc] ?? jc : null].filter(Boolean).join(" · ")] });
        if (ai && ai !== "normal") css.push({ prop: "align-items", value: [ai] });
        if (jc && jc !== "normal") css.push({ prop: "justify-content", value: [jc] });
      }
    }

    const pad = [box.padding.top, box.padding.right, box.padding.bottom, box.padding.left];
    if (pad.some(Boolean)) {
      const u = usage("padding");
      rows.push({ label: "Padding", value: sides(pad), token: u?.token, utility: u?.utility, source: u?.source });
      css.push({ prop: "padding", value: sides(pad), token: spacingToken(sides(pad).filter((p): p is { px: number } => typeof p === "object" && "px" in p).map((p) => p.px)) });
    }
    const mar = [box.margin.top, box.margin.right, box.margin.bottom, box.margin.left];
    if (mar.some(Boolean)) {
      const u = usage("margin");
      rows.push({ label: "Margem", value: sides(mar), token: u?.token, utility: u?.utility, source: u?.source });
      css.push({ prop: "margin", value: sides(mar) });
    }
    if (s.position && s.position !== "static") {
      const offsets = (["top", "right", "bottom", "left"] as const).filter((k) => s[k] && s[k] !== "auto");
      rows.push({ label: "Posição", value: [s.position, ...offsets.flatMap((k) => [` · ${k} `, { px: px(s[k]) } as ValuePart])] });
      css.push({ prop: "position", value: [s.position] });
      for (const k of offsets) css.push({ prop: k, value: [{ px: px(s[k]) }] });
      if (s["z-index"] && s["z-index"] !== "auto") css.push({ prop: "z-index", value: [s["z-index"]] });
    }
    const ox = s["overflow-x"];
    const oy = s["overflow-y"];
    if ((ox && ox !== "visible") || (oy && oy !== "visible")) {
      const value = ox === oy ? ox : `${ox} ${oy}`;
      rows.push({ label: "Overflow", value: [value] });
      css.push({ prop: "overflow", value: [value] });
    }
    sections.push({ id: "layout", title: "Layout", rows, css, tailwind: tw.layout });
  }

  // ----------------------------------------------------------------- Modos
  {
    const bp = currentBreakpoint(viewportWidth);
    sections.push({
      id: "modos",
      title: "Modos",
      listOnly: true,
      css: [],
      tailwind: [],
      rows: [
        { label: "Tema", value: [`Automático (${theme})`] },
        { label: "Breakpoint", value: [`${bp} (`, { px: viewportWidth }, ")"] },
        { label: "Tokens", value: [usesOmniaTokens ? "Omnia DS" : "Não detectados"] },
      ],
    });
  }

  // ----------------------------------------------------------------- Cores
  {
    const colors = usages.filter((u) => u.group === "Cor" || u.property === "ring");
    const propMap: Record<string, string> = {
      color: "color",
      "background-color": "background-color",
      fill: "fill",
      stroke: "stroke",
    };
    const css: CssDecl[] = colors
      .filter((u) => u.swatch)
      .map((u) => ({
        prop: propMap[u.property] ?? (u.property.startsWith("border") ? "border-color" : u.property === "ring" ? "outline-color" : u.property),
        value: [{ color: u.value }],
        token: u.token?.startsWith("--") ? (u.alpha !== undefined && u.alpha < 1 ? `color-mix(in oklab, var(${u.token}) ${Math.round(u.alpha * 100)}%, transparent)` : `var(${u.token})`) : undefined,
      }));
    sections.push({
      id: "cores",
      title: "Cores",
      rows: colors.map((u) => ({
        label: u.label,
        value: u.swatch ? [{ color: u.value }] : [u.display],
        token: u.token,
        utility: u.utility,
        swatch: u.swatch,
        source: u.source,
      })),
      css,
      tailwind: tw.cores,
    });
  }

  // ------------------------------------------------------------ Tipografia
  {
    const typo = usages.filter((u) => u.group === "Tipografia");
    const rows: PropertyRow[] = typo.map((u) => ({
      label: u.label,
      value:
        u.property === "font-size" || u.property === "letter-spacing"
          ? [{ px: px(u.value) }]
          : u.property === "line-height" && /px$/.test(u.value)
            ? [{ px: px(u.value) }]
            : [u.display],
      token: u.token,
      utility: u.utility,
      source: u.source,
    }));
    const css: CssDecl[] = typo.map((u) => {
      const tokenVar = u.token?.startsWith("--") ? `var(${u.token})` : undefined;
      if (u.property === "font-family") return { prop: "font-family", value: [u.value], token: tokenVar };
      if (u.property === "font-size" || u.property === "letter-spacing") return { prop: u.property, value: [{ px: px(u.value) }], token: tokenVar };
      if (u.property === "line-height") return { prop: "line-height", value: /px$/.test(u.value) ? [{ px: px(u.value) }] : [u.value], token: tokenVar };
      return { prop: u.property, value: [u.value], token: tokenVar };
    });
    if (typo.length) {
      const ta = s["text-align"];
      if (ta && !["start", "left"].includes(ta)) {
        rows.push({ label: "Alinhamento", value: [TEXT_ALIGN[ta] ?? ta] });
        css.push({ prop: "text-align", value: [ta] });
      }
      const tt = s["text-transform"];
      if (tt && tt !== "none") {
        rows.push({ label: "Caixa", value: [TRANSFORM[tt] ?? tt] });
        css.push({ prop: "text-transform", value: [tt] });
      }
      const td = s["text-decoration-line"];
      if (td && td !== "none") {
        rows.push({ label: "Decoração", value: [td] });
        css.push({ prop: "text-decoration-line", value: [td] });
      }
      sections.push({ id: "tipografia", title: "Tipografia", rows, css, tailwind: tw.tipografia });
    }
  }

  // ------------------------------------------------------------- Aparência
  {
    const rows: PropertyRow[] = [];
    const css: CssDecl[] = [];
    const radius = usage("border-radius");
    if (radius) {
      const corners = ["top-left", "top-right", "bottom-right", "bottom-left"].map((c) => px(s[`border-${c}-radius`]));
      const value = sides(corners);
      rows.push({ label: "Raio", value, token: radius.token, utility: radius.utility, source: radius.source });
      css.push({ prop: "border-radius", value, token: radius.token?.startsWith("--") && !radius.token.includes("/") ? `var(${radius.token})` : undefined });
    }
    const bw = [box.border.top, box.border.right, box.border.bottom, box.border.left];
    if (bw.some(Boolean)) {
      const style = s["border-top-style"] ?? "solid";
      rows.push({ label: "Borda", value: [...sides(bw), ` ${style}`] });
      css.push({ prop: "border-width", value: sides(bw) }, { prop: "border-style", value: [style] });
    }
    const shadow = usage("box-shadow");
    if (shadow) {
      rows.push({ label: "Sombra", value: [shadow.display], token: shadow.token, utility: shadow.utility, source: shadow.source });
      css.push({ prop: "box-shadow", value: [shadow.value], token: shadow.token ? `var(${shadow.token})` : undefined });
    }
    const opacity = usage("opacity");
    if (opacity) {
      rows.push({ label: "Opacidade", value: [opacity.display], utility: opacity.utility });
      css.push({ prop: "opacity", value: [opacity.value] });
    }
    if (rows.length) sections.push({ id: "aparencia", title: "Aparência", rows, css, tailwind: tw.aparencia });
  }

  return sections;
}
