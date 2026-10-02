import { deltaE, parseColor } from "./color";
import { nativeEquivalent } from "./identify";
import type { KnowledgeIndex, TokenIndex } from "./knowledge";
import type { ClassMeaning } from "./tailwind";
import { matchColor, spacingStep, type TokenAnalysis } from "./tokens";
import type { ComponentIdentity, ElementSnapshot, Finding } from "./types";

const DESIGN_KINDS = new Set(["color", "radius", "font-size", "shadow", "spacing", "font-weight", "font-family"]);

const INLINE_DESIGN_PROPS =
  /^(color|background|background-color|padding.*|margin.*|gap|font-size|font-weight|font-family|line-height|border-radius|box-shadow|border(-.*)?-color|border)$/;

function describeArbitrary(m: ClassMeaning, index: TokenIndex): string | undefined {
  if (m.kind === "color" && m.arbitrary) {
    const color = parseColor(m.arbitrary);
    if (!color) return undefined;
    const match = matchColor(color, m.property, index);
    if (match.token) {
      const prefix = m.cls.base.split("-[")[0];
      const options = [match.token, ...match.alternatives.filter((t) => !t.primitive)]
        .slice(0, 3)
        .map((t) => (t.utility ? `${prefix}-${t.utility}` : t.name));
      const same = deltaE(color, match.token.rgba) < 0.1;
      return `Use ${options.join(" ou ")} (${match.token.name}) — ${same ? "mesmo valor" : "valor praticamente idêntico"}`;
    }
    if (match.nearest) return `Token mais próximo: ${match.nearest.token.name} (ΔE ${match.nearest.distance.toFixed(1)})`;
  }
  if ((m.kind === "spacing" || m.kind === "size") && m.px !== undefined) {
    const { onScale, nearest } = spacingStep(m.px);
    const prefix = m.cls.base.split("-[")[0];
    return onScale ? `Equivale a ${prefix}-${m.px / 4}` : `Mais próximo na escala: ${prefix}-${nearest} (${nearest * 4}px)`;
  }
  if (m.kind === "radius" && m.px !== undefined) {
    const near = [...index.radius].sort((a, b) => Math.abs(a.px - m.px!) - Math.abs(b.px - m.px!))[0];
    return near ? `Mais próximo: rounded-${near.utility} (${near.px}px)` : undefined;
  }
  if (m.kind === "font-size" && m.px !== undefined) {
    const near = [...index.text].sort((a, b) => Math.abs(a.px - m.px!) - Math.abs(b.px - m.px!))[0];
    return near ? `Mais próximo: text-${near.utility} (${near.px}px)` : undefined;
  }
  return undefined;
}

export function audit(
  el: ElementSnapshot,
  component: ComponentIdentity,
  tokens: TokenAnalysis,
  index: TokenIndex,
  k: KnowledgeIndex,
  opts: { usesOmniaTokens: boolean },
): Finding[] {
  const findings: Finding[] = [];
  const reported = new Set<string>();

  // 1. Valores computados sem token correspondente
  for (const off of tokens.offScale) {
    const { usage } = off;
    // Se a classe responsável é arbitrária, o alerta de classe cobre
    if (usage.utility && /\[/.test(usage.utility)) continue;
    reported.add(usage.property);
    findings.push({
      severity: usage.group === "Cor" || usage.group === "Tipografia" ? "warning" : "info",
      category: "token",
      title: `${usage.label}: ${usage.display} não corresponde a um token${opts.usesOmniaTokens ? " Omnia" : " do Omnia"}`,
      detail: off.detail,
      suggestion: off.suggestion,
    });
  }

  // 2. Classes problemáticas
  for (const m of tokens.classMeanings) {
    if (!DESIGN_KINDS.has(m.kind)) continue;
    if (m.arbitrary) {
      // cva do próprio DS usa alguns arbitrários (ex.: ring-[3px]) — ignora os do componente
      if (component.kind !== "native" && component.kind !== "react" && !component.extraClasses.includes(m.cls.raw)) continue;
      findings.push({
        severity: "warning",
        category: "classe",
        title: `Valor arbitrário: ${m.cls.raw}`,
        detail: "Valores entre colchetes fogem dos tokens do design system.",
        suggestion: describeArbitrary(m, index),
      });
    } else if (m.tailwindPalette) {
      const computed = parseColor(el.styles[m.affects[0]] ?? "");
      const match = computed ? matchColor(computed, m.property, index) : undefined;
      findings.push({
        severity: "warning",
        category: "classe",
        title: `${m.cls.raw} usa a paleta padrão do Tailwind`,
        detail: "Cores como red-500/gray-600 não são tokens semânticos e não respondem ao tema.",
        suggestion: match?.nearest
          ? `Token semântico mais próximo: ${match.nearest.token.name}${match.nearest.token.utility ? ` (${m.cls.base.split("-")[0]}-${match.nearest.token.utility})` : ""}`
          : undefined,
      });
    } else if (m.kind === "color" && (m.name === "white" || m.name === "black")) {
      findings.push({
        severity: "info",
        category: "classe",
        title: `${m.cls.raw} é uma cor fixa`,
        detail: "Não se adapta ao modo escuro.",
        suggestion:
          m.property === "color"
            ? m.name === "white"
              ? "Use o *-foreground do fundo (ex.: text-primary-foreground, text-brand-foreground)."
              : "Use text-foreground."
            : m.name === "white"
              ? "Use bg-background ou bg-card."
              : "Use bg-primary ou bg-foreground.",
      });
    } else if (m.unknown && m.kind === "color") {
      findings.push({
        severity: "info",
        category: "classe",
        title: `${m.cls.raw}: cor não existe no Omnia DS`,
        detail: "Pode ser um token local do projeto.",
      });
    }
  }

  // 3. Estilos inline
  if (el.inlineStyle) {
    const props = el.inlineStyle
      .split(";")
      .map((d) => d.split(":")[0]?.trim().toLowerCase())
      .filter((p) => p && INLINE_DESIGN_PROPS.test(p));
    if (props.length) {
      findings.push({
        severity: "warning",
        category: "inline",
        title: `Estilo inline em ${[...new Set(props)].join(", ")}`,
        detail: el.inlineStyle.slice(0, 160),
        suggestion: "Mova para classes utilitárias com tokens.",
      });
    }
  }

  // 4. Componente
  if (component.kind === "shadcn" && opts.usesOmniaTokens && component.family) {
    if (k.omnia.families.has(component.family)) {
      findings.push({
        severity: "info",
        category: "componente",
        title: `${component.name} local (shadcn) — existe no Omnia DS`,
        detail: `Esta página usa tokens Omnia, mas o componente vem de ${component.designSystem}.`,
        suggestion: `import { ${component.name} } from "@omnia-ds/ui"`,
      });
    }
  }
  if (component.kind === "native" || component.kind === "react") {
    const equivalent = nativeEquivalent(el);
    if (equivalent && k.omnia.families.has(equivalent)) {
      findings.push({
        severity: "info",
        category: "componente",
        title: `<${el.tag}> nativo — existe <${equivalent}> no Omnia DS`,
        suggestion: `import { ${equivalent} } from "@omnia-ds/ui"`,
      });
    }
  }
  if ((component.kind === "omnia" || component.kind === "shadcn") && component.extraClasses.length) {
    const overrides = component.extraClasses.filter((c) =>
      /^(h|w|size|p[xytrbl]?|rounded|text|bg|border|font|gap)-/.test(c.split(":").pop() ?? ""),
    );
    if (overrides.length) {
      findings.push({
        severity: "info",
        category: "componente",
        title: `Customizações sobre o ${component.name}`,
        detail: overrides.join(" "),
        suggestion: "Verifique se uma variante existente atende antes de sobrescrever estilos.",
      });
    }
  }
  if (component.variants.some((v) => v.source === "classes" && v.confidence < 0.6)) {
    findings.push({
      severity: "info",
      category: "componente",
      title: "Variante incerta",
      detail: "As classes não batem exatamente com nenhuma variante — pode haver sobrescrita via className.",
    });
  }

  // Cor igual ao token com ΔE pequeno mas não exato (ex.: #ff4e4e vs #ff4d4d)
  for (const u of tokens.usages) {
    if (u.group !== "Cor" || u.source !== "fora do padrão" || reported.has(u.property)) continue;
    const c = parseColor(u.value);
    const near = c ? index.colors.find((t) => deltaE(t.rgba, c) < 3) : undefined;
    if (near) {
      findings.push({ severity: "warning", category: "token", title: `${u.label} quase igual a ${near.name}`, suggestion: near.name });
    }
  }
  return findings;
}
