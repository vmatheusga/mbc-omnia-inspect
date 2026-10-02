import {
  deltaE,
  formatColor,
  isTransparent,
  parseColor,
  toCss,
  toOpaque,
  type RGBA,
} from "./color";
import { parseShadow, type ColorToken, type ShadowLayer, type TokenIndex } from "./knowledge";
import {
  interpretClass,
  BREAKPOINTS,
  isBaseState,
  LEADING_NAMED,
  SPACING_SCALE,
  stateOf,
  type ClassMeaning,
} from "./tailwind";
import type { ElementSnapshot, StateToken, TokenGroup, TokenUsage } from "./types";

// ---------------------------------------------------------------------------
// Casamento por valor
// ---------------------------------------------------------------------------

export interface ColorMatch {
  token?: ColorToken;
  alternatives: ColorToken[];
  /** Alpha aplicado sobre o token (ex.: bg-primary/90). */
  alpha?: number;
  nearest?: { token: ColorToken; distance: number };
}

function colorPreference(token: ColorToken, property: string): number {
  const n = token.name;
  let score = token.primitive ? -5 : 0;
  const isFg = /foreground/.test(n);
  if (property === "background-color") {
    if (isFg) score -= 3;
    if (/background|card|popover|primary|secondary|muted|accent|brand|info|success|warning|destructive|sidebar$|overlay/.test(n)) score += 1;
    if (/^--(border|input|ring)/.test(n)) score -= 2;
  } else if (property === "color" || property === "fill" || property === "stroke") {
    if (isFg || n === "--foreground") score += 3;
    if (/background|^--(border|input|ring|card|popover)$/.test(n)) score -= 2;
  } else if (property === "border-color" || property === "outline-color" || property === "ring-color") {
    if (/^--(border|input|ring|sidebar-border|sidebar-ring)/.test(n)) score += 3;
    if (isFg) score -= 2;
  }
  if (/sidebar|ecosystem/.test(n)) score -= 1;
  return score;
}

export function matchColor(color: RGBA, property: string, index: TokenIndex): ColorMatch {
  const exact: ColorToken[] = [];
  const alphaMatches: ColorToken[] = [];
  let nearest: ColorMatch["nearest"];

  for (const token of index.colors) {
    const d = deltaE(color, token.rgba);
    if (d < 0.6) exact.push(token);
    else if (color.a < 1 && token.rgba.a === 1 && deltaE(toOpaque(color), token.rgba) < 0.6) {
      alphaMatches.push(token);
    }
    if (!token.primitive && (!nearest || d < nearest.distance)) nearest = { token, distance: d };
  }

  const rank = (list: ColorToken[]) =>
    [...list].sort((a, b) => colorPreference(b, property) - colorPreference(a, property));

  if (exact.length) {
    const [token, ...alternatives] = rank(exact);
    return { token, alternatives, nearest };
  }
  if (alphaMatches.length) {
    const [token, ...alternatives] = rank(alphaMatches);
    return { token, alternatives, alpha: color.a, nearest };
  }
  return { alternatives: [], nearest };
}

export function nearestInScale(px: number, scale: number[]): number {
  return scale.reduce((best, v) => (Math.abs(v - px) < Math.abs(best - px) ? v : best), scale[0]);
}

export function spacingStep(px: number): { onScale: boolean; step: number; nearest: number } {
  const step = px / 4;
  const onScale = px === 1 || SPACING_SCALE.includes(Math.round(step * 100) / 100);
  return { onScale, step, nearest: nearestInScale(step, SPACING_SCALE) };
}

const fmtStep = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, ""));
const px = (v: string | undefined) => (v ? parseFloat(v) : 0);
const fmtPx = (n: number) => `${Math.round(n * 100) / 100}px`;

function shadowsEqual(a: ShadowLayer[], b: ShadowLayer[]): boolean {
  if (a.length !== b.length) return false;
  const key = (l: ShadowLayer) => `${l.x}|${l.y}|${l.blur}|${l.spread}|${l.inset}`;
  const sortedA = [...a].sort((x, y) => key(x).localeCompare(key(y)));
  const sortedB = [...b].sort((x, y) => key(x).localeCompare(key(y)));
  return sortedA.every(
    (l, i) =>
      key(l) === key(sortedB[i]) && deltaE(l.color, sortedB[i].color) < 3,
  );
}

// ---------------------------------------------------------------------------
// Linhas de token para o painel
// ---------------------------------------------------------------------------

export interface TokenAnalysis {
  usages: TokenUsage[];
  stateTokens: StateToken[];
  classMeanings: ClassMeaning[];
  /** Linhas cujo valor não corresponde a nenhum token (para auditoria). */
  offScale: Array<{ usage: TokenUsage; suggestion?: string; detail?: string }>;
}

export function analyzeTokens(el: ElementSnapshot, index: TokenIndex, viewportWidth = 1280): TokenAnalysis {
  const s = el.styles;
  const meanings = el.classes
    .map((c) => interpretClass(c, index))
    .filter((m): m is ClassMeaning => m !== null);
  const baseMeanings = meanings.filter((m) => isBaseState(m.cls, index.theme, viewportWidth));

  const usages: TokenUsage[] = [];
  const offScale: TokenAnalysis["offScale"] = [];

  // Para a mesma propriedade, o breakpoint ativo mais largo vence (p-2 md:p-6 → md:p-6).
  const bpWeight = (m: ClassMeaning) =>
    Math.max(0, ...m.cls.modifiers.map((mod) => BREAKPOINTS[mod] ?? 0));
  const classesFor = (property: string | string[]) => {
    const props = Array.isArray(property) ? property : [property];
    const matching = baseMeanings.filter((m) => props.includes(m.property));
    return matching.filter(
      (m) => !matching.some((other) => other.property === m.property && bpWeight(other) > bpWeight(m)),
    );
  };

  // ------------------------------------------------------------------ Cores
  const colorRow = (
    property: string,
    cssProp: string,
    label: string,
    opts: { inheritedFrom?: string } = {},
  ) => {
    const value = s[cssProp];
    const color = parseColor(value);
    if (!color || isTransparent(color)) return;
    const fromClass = classesFor(property).filter((m) => m.token || m.tailwindPalette || m.arbitrary);
    // Escolhe a classe cujo token corresponde ao valor computado
    const consistent = fromClass.find((m) => {
      if (!m.token) return false;
      const t = index.colors.find((c) => c.name === m.token);
      if (!t) return false;
      const expected = m.alpha !== undefined ? { ...t.rgba, a: t.rgba.a * m.alpha } : t.rgba;
      return deltaE(expected, color) < 2;
    });
    const usage: TokenUsage = {
      group: "Cor",
      property: cssProp,
      label,
      value: toCss(color),
      display: formatColor(color),
      swatch: toCss(color),
      source: "valor",
    };
    if (consistent) {
      usage.token = consistent.token;
      usage.utility = consistent.cls.raw;
      usage.alpha = consistent.alpha;
      usage.source = "classe";
      usages.push(usage);
      return;
    }
    const match = matchColor(color, property, index);
    if (match.token) {
      usage.token = match.token.name;
      usage.alternatives = match.alternatives.slice(0, 3).map((t) => t.name);
      usage.alpha = match.alpha;
      usage.utility = fromClass[0]?.cls.base;
      if (match.token.utility && !usage.utility) {
        const prefix = { "background-color": "bg", color: "text", "border-color": "border", fill: "fill", stroke: "stroke", "outline-color": "outline" }[property];
        if (prefix && !match.token.primitive) {
          usage.utility = `${prefix}-${match.token.utility}${match.alpha ? `/${Math.round(match.alpha * 100)}` : ""}`;
        }
      }
      if (opts.inheritedFrom && !fromClass.length) usage.source = "herdado";
      usages.push(usage);
      return;
    }
    if (opts.inheritedFrom && !fromClass.length) {
      usage.source = "herdado";
      usages.push(usage);
      return;
    }
    usage.source = "fora do padrão";
    usage.utility = fromClass[0]?.cls.base;
    usages.push(usage);
    const near = match.nearest;
    offScale.push({
      usage,
      suggestion: near
        ? `${near.token.name}${near.token.utility ? ` (${prefixFor(property)}-${near.token.utility})` : ""} — ΔE ${near.distance.toFixed(1)}`
        : undefined,
    });
  };

  const parentSame =
    el.parentColor && parseColor(el.parentColor) && parseColor(s.color)
      ? deltaE(parseColor(el.parentColor)!, parseColor(s.color)!) < 0.5
      : false;

  colorRow("color", "color", "Texto", { inheritedFrom: parentSame ? "pai" : undefined });
  colorRow("background-color", "background-color", "Fundo");
  const borderSides = ["top", "right", "bottom", "left"].filter((side) => px(s[`border-${side}-width`]) > 0);
  if (borderSides.length) {
    colorRow("border-color", `border-${borderSides[0]}-color`, "Borda");
  }
  if (el.tag === "svg" || el.tag === "path") {
    if (s.fill && s.fill !== "none") colorRow("fill", "fill", "Preenchimento (fill)");
    if (s.stroke && s.stroke !== "none") colorRow("stroke", "stroke", "Traço (stroke)");
  }

  // ------------------------------------------------------------ Tipografia
  if (el.hasDirectText || ["button", "a", "label", "input", "textarea", "select", "p", "span", "h1", "h2", "h3", "h4", "h5", "h6", "li"].includes(el.tag)) {
    const fontSizePx = px(s["font-size"]);
    const inheritedFont = el.parentStyles?.["font-size"] === s["font-size"];

    // Família
    const family = (s["font-family"] ?? "").split(",")[0]?.replace(/["']/g, "").trim();
    if (family) {
      const cls = classesFor("font-family")[0];
      const font = index.fonts.find((f) => f.first.toLowerCase() === family.toLowerCase());
      const usage: TokenUsage = {
        group: "Tipografia",
        property: "font-family",
        label: "Família",
        value: s["font-family"],
        display: family,
        token: font?.name,
        utility: cls?.cls.raw ?? (font ? `font-${font.utility}` : undefined),
        source: font ? (cls ? "classe" : "valor") : "fora do padrão",
      };
      usages.push(usage);
      if (!font) {
        offScale.push({ usage, suggestion: index.fonts.map((f) => `${f.name} (${f.first})`).join(" ou ") });
      }
    }

    // Tamanho
    if (fontSizePx) {
      const cls = classesFor("font-size").find((m) => m.px === undefined || Math.abs(m.px - fontSizePx) < 0.5);
      const token = index.text.find((t) => Math.abs(t.px - fontSizePx) < 0.5);
      const usage: TokenUsage = {
        group: "Tipografia",
        property: "font-size",
        label: "Tamanho",
        value: s["font-size"],
        display: fmtPx(fontSizePx),
        token: token?.name,
        utility: cls?.cls.raw ?? (token ? `text-${token.utility}` : undefined),
        source: token ? (cls ? "classe" : inheritedFont ? "herdado" : "valor") : "fora do padrão",
      };
      usages.push(usage);
      if (!token && !(inheritedFont && !cls)) {
        const near = [...index.text].sort((a, b) => Math.abs(a.px - fontSizePx) - Math.abs(b.px - fontSizePx))[0];
        offScale.push({ usage, suggestion: near ? `${near.name} (text-${near.utility}, ${fmtPx(near.px)})` : undefined });
      }
    }

    // Peso
    const weight = parseFloat(s["font-weight"] ?? "");
    if (weight) {
      const cls = classesFor("font-weight")[0];
      const token = index.weights.find((w) => w.value === weight);
      usages.push({
        group: "Tipografia",
        property: "font-weight",
        label: "Peso",
        value: s["font-weight"],
        display: String(weight),
        token: token?.name,
        utility: cls?.cls.raw ?? (token ? `font-${token.utility}` : undefined),
        source: token ? (cls ? "classe" : "valor") : "fora do padrão",
      });
      if (!token) {
        offScale.push({ usage: usages[usages.length - 1], suggestion: index.weights.map((w) => `${w.value}`).join(" · ") });
      }
    }

    // Altura de linha
    const lh = s["line-height"];
    if (lh && fontSizePx) {
      const cls = classesFor("line-height")[0];
      const ratio = lh === "normal" ? undefined : px(lh) / fontSizePx;
      const text = index.text.find((t) => Math.abs(t.px - fontSizePx) < 0.5);
      let token: string | undefined;
      let utility = cls?.cls.raw;
      if (ratio !== undefined) {
        if (text?.lineHeight && Math.abs(text.lineHeight - ratio) < 0.02) {
          token = `${text.name}--line-height`;
        } else {
          const named = Object.entries(LEADING_NAMED).find(([, v]) => Math.abs(v - ratio) < 0.02);
          if (named) utility ??= `leading-${named[0]}`;
          else if (Math.abs(px(lh) / 4 - Math.round(px(lh) / 4)) < 0.01) utility ??= `leading-${px(lh) / 4}`;
        }
      }
      usages.push({
        group: "Tipografia",
        property: "line-height",
        label: "Altura de linha",
        value: lh,
        display: ratio !== undefined ? `${fmtPx(px(lh))} · ${ratio.toFixed(2)}` : lh,
        token,
        utility,
        source: token || utility ? (cls ? "classe" : "valor") : "escala",
      });
    }

    // Espaçamento entre letras
    const ls = s["letter-spacing"];
    if (ls && ls !== "normal" && px(ls) !== 0) {
      const cls = classesFor("letter-spacing")[0];
      usages.push({
        group: "Tipografia",
        property: "letter-spacing",
        label: "Espaço entre letras",
        value: ls,
        display: ls,
        utility: cls?.cls.raw,
        source: cls ? "classe" : "valor",
      });
    }
  }

  // ------------------------------------------------------------ Espaçamento
  const boxRow = (kind: "padding" | "margin", label: string) => {
    const sides = ["top", "right", "bottom", "left"].map((side) => px(s[`${kind}-${side}`]));
    if (sides.every((v) => v === 0)) return;
    const cls = classesFor([kind, `${kind}-x`, `${kind}-y`, `${kind}-top`, `${kind}-right`, `${kind}-bottom`, `${kind}-left`]);
    const unique = [...new Set(sides)];
    const display =
      unique.length === 1
        ? fmtPx(sides[0])
        : sides[0] === sides[2] && sides[1] === sides[3]
          ? `${fmtPx(sides[0])} ${fmtPx(sides[1])}`
          : sides.map(fmtPx).join(" ");
    const off = unique.filter((v) => v > 0 && !spacingStep(Math.abs(v)).onScale);
    const scaleText = unique
      .map((v) => (spacingStep(Math.abs(v)).onScale ? `${fmtStep(v / 4)}` : `${fmtPx(v)}?`))
      .join(" / ");
    const usage: TokenUsage = {
      group: "Espaçamento",
      property: kind,
      label,
      value: sides.map(fmtPx).join(" "),
      display,
      token: off.length ? undefined : `--spacing × ${scaleText}`,
      utility: cls.map((m) => m.cls.raw).join(" ") || undefined,
      source: off.length ? "fora do padrão" : cls.length ? "classe" : "escala",
    };
    usages.push(usage);
    if (off.length) {
      offScale.push({
        usage,
        detail: `${off.map(fmtPx).join(", ")} fora da escala de 4px`,
        suggestion: off
          .map((v) => {
            const n = spacingStep(Math.abs(v)).nearest;
            return `${fmtPx(v)} → ${fmtPx(n * 4)} (${kind === "padding" ? "p" : "m"}-${fmtStep(n)})`;
          })
          .join(", "),
      });
    }
  };
  boxRow("padding", "Padding");
  boxRow("margin", "Margem");

  const rowGap = px(s["row-gap"]);
  const colGap = px(s["column-gap"]);
  const display = s.display ?? "";
  if ((rowGap || colGap) && /flex|grid/.test(display)) {
    const values = [...new Set([rowGap, colGap].filter(Boolean))];
    const off = values.filter((v) => !spacingStep(v).onScale);
    const cls = classesFor(["gap", "column-gap", "row-gap"]);
    const usage: TokenUsage = {
      group: "Espaçamento",
      property: "gap",
      label: "Gap",
      value: `${fmtPx(rowGap)} ${fmtPx(colGap)}`,
      display: values.map(fmtPx).join(" / "),
      token: off.length ? undefined : `--spacing × ${values.map((v) => fmtStep(v / 4)).join(" / ")}`,
      utility: cls.map((m) => m.cls.raw).join(" ") || undefined,
      source: off.length ? "fora do padrão" : cls.length ? "classe" : "escala",
    };
    usages.push(usage);
    if (off.length) {
      offScale.push({
        usage,
        suggestion: off.map((v) => `${fmtPx(v)} → gap-${fmtStep(spacingStep(v).nearest)}`).join(", "),
      });
    }
  }

  // ------------------------------------------------------------ Dimensões
  const sizeClasses = classesFor(["height", "width", "size", "min-height", "min-width", "max-width", "max-height"]);
  usages.push({
    group: "Dimensões",
    property: "size",
    label: "Tamanho",
    value: `${fmtPx(el.rect.width)} × ${fmtPx(el.rect.height)}`,
    display: `${Math.round(el.rect.width)} × ${Math.round(el.rect.height)}`,
    utility: sizeClasses.map((m) => m.cls.raw).join(" ") || undefined,
    source: sizeClasses.length ? "classe" : "valor",
  });

  // ------------------------------------------------------------------ Raio
  const corners = ["top-left", "top-right", "bottom-right", "bottom-left"].map((c) => px(s[`border-${c}-radius`]));
  if (corners.some((v) => v > 0)) {
    const unique = [...new Set(corners.filter((v) => v > 0))];
    const tokens = unique.map((v) => ({
      v,
      token: index.radius.find((r) => Math.abs(r.px - v) < 0.5),
      full: v >= 9999 || v >= Math.min(el.rect.width, el.rect.height) / 2,
    }));
    const cls = classesFor("border-radius");
    const off = tokens.filter((t) => !t.token && !t.full);
    const usage: TokenUsage = {
      group: "Raio",
      property: "border-radius",
      label: "Raio",
      value: corners.map(fmtPx).join(" "),
      display: [...new Set(corners)].length === 1 ? fmtPx(corners[0]) : corners.map(fmtPx).join(" "),
      token: tokens.map((t) => t.token?.name ?? (t.full ? "full" : "")).filter(Boolean).join(" / ") || undefined,
      utility: cls.map((m) => m.cls.raw).join(" ") || tokens.map((t) => (t.token ? `rounded-${t.token.utility}` : t.full ? "rounded-full" : "")).filter(Boolean).join(" ") || undefined,
      source: off.length ? "fora do padrão" : cls.length ? "classe" : "valor",
    };
    usages.push(usage);
    if (off.length) {
      offScale.push({
        usage,
        suggestion: off
          .map((o) => {
            const near = [...index.radius].sort((a, b) => Math.abs(a.px - o.v) - Math.abs(b.px - o.v))[0];
            return `${fmtPx(o.v)} → ${near.name} (rounded-${near.utility}, ${fmtPx(near.px)})`;
          })
          .join(", "),
      });
    }
  }

  // ---------------------------------------------------------------- Sombra
  const layers = parseShadow(s["box-shadow"], index.rootFontSize);
  const rings = layers.filter((l) => !l.x && !l.y && !l.blur && l.spread > 0 && !l.inset);
  const shadows = layers.filter((l) => !rings.includes(l));
  if (shadows.length) {
    const token = index.shadows.find((t) => shadowsEqual(t.layers, shadows));
    const cls = classesFor("box-shadow")[0];
    const usage: TokenUsage = {
      group: "Sombra",
      property: "box-shadow",
      label: "Sombra",
      value: s["box-shadow"],
      display: token ? `shadow-${token.utility}` : `${shadows.length} camada(s)`,
      token: token?.name,
      utility: cls?.cls.raw ?? (token ? `shadow-${token.utility}` : undefined),
      source: token ? (cls ? "classe" : "valor") : "fora do padrão",
    };
    usages.push(usage);
    if (!token) offScale.push({ usage, suggestion: index.shadows.map((t) => `shadow-${t.utility}`).join(", ") });
  }
  for (const ring of rings) {
    const match = matchColor(ring.color, "ring-color", index);
    usages.push({
      group: "Efeitos",
      property: "ring",
      label: "Ring",
      value: `${fmtPx(ring.spread)} ${toCss(ring.color)}`,
      display: `${fmtPx(ring.spread)} · ${formatColor(ring.color)}`,
      swatch: toCss(ring.color),
      token: match.token?.name,
      alpha: match.alpha,
      source: match.token ? "valor" : "fora do padrão",
    });
  }

  // --------------------------------------------------------------- Efeitos
  const opacity = parseFloat(s.opacity ?? "1");
  if (opacity < 1) {
    const cls = classesFor("opacity")[0];
    usages.push({
      group: "Efeitos",
      property: "opacity",
      label: "Opacidade",
      value: s.opacity,
      display: `${Math.round(opacity * 100)}%`,
      utility: cls?.cls.raw ?? `opacity-${Math.round(opacity * 100)}`,
      source: cls ? "classe" : "valor",
    });
  }

  // ------------------------------------------------------ Estados (hover…)
  const stateTokens: StateToken[] = meanings
    .filter((m) => !isBaseState(m.cls, index.theme, viewportWidth))
    .map((m) => ({ state: stateOf(m.cls.modifiers) ?? "", utility: m.cls.base, token: m.token, property: m.property }))
    .filter((t) => t.state && (t.token || t.property));

  return { usages, stateTokens, classMeanings: meanings, offScale };
}

function prefixFor(property: string) {
  return (
    { "background-color": "bg", color: "text", "border-color": "border", fill: "fill", stroke: "stroke", "outline-color": "outline", "ring-color": "ring" }[property] ?? "bg"
  );
}

export const TOKEN_GROUP_ORDER: TokenGroup[] = ["Cor", "Tipografia", "Espaçamento", "Dimensões", "Raio", "Sombra", "Efeitos"];
