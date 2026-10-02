import {
  allComponentClasses,
  baseClassesFor,
  isOmniaOnlyColor,
  pascal,
  variantConfigFor,
  type DesignSystemIndex,
  type KnowledgeIndex,
} from "./knowledge";
import { parseClass } from "./tailwind";
import type {
  ComponentIdentity,
  ComponentKind,
  ElementSnapshot,
  NodeRef,
  SlotDef,
  VariantConfig,
  VariantGuess,
} from "./types";

// ---------------------------------------------------------------------------
// Variantes
// ---------------------------------------------------------------------------

export function guessVariants(
  classes: string[],
  config: VariantConfig | undefined,
  attrs: Record<string, string>,
  reactProps?: Record<string, unknown>,
): VariantGuess[] {
  if (!config) return [];
  const set = new Set(classes);
  const guesses: VariantGuess[] = [];

  for (const [dimension, options] of Object.entries(config.variants)) {
    const def = config.defaults[dimension];
    const fromReact = reactProps?.[dimension];
    if (typeof fromReact === "string" && fromReact in options) {
      guesses.push({ dimension, value: fromReact, confidence: 1, source: "react", isDefault: fromReact === def });
      continue;
    }
    const fromAttr = attrs[`data-${dimension}`];
    if (fromAttr && fromAttr in options) {
      guesses.push({ dimension, value: fromAttr, confidence: 0.95, source: "atributo", isDefault: fromAttr === def });
      continue;
    }

    // Pontua cada opção pela fração das suas classes presentes no elemento.
    // Classes compartilhadas por todas as opções não discriminam.
    const counts = new Map<string, number>();
    Object.values(options).forEach((list) => new Set(list).forEach((c) => counts.set(c, (counts.get(c) ?? 0) + 1)));
    const total = Object.keys(options).length;
    const scored = Object.entries(options)
      .map(([value, list]) => {
        const distinctive = list.filter((c) => (counts.get(c) ?? 0) < total);
        const matched = distinctive.filter((c) => set.has(c)).length;
        return {
          value,
          matched,
          ratio: distinctive.length ? matched / distinctive.length : 0,
          size: distinctive.length,
        };
      })
      .sort((a, b) => b.ratio - a.ratio || b.matched - a.matched);

    const [best, second] = scored;
    if (best && best.matched > 0 && best.ratio >= 0.5) {
      const margin = second ? best.ratio - second.ratio : best.ratio;
      const confidence = Math.min(0.97, 0.55 + best.ratio * 0.3 + margin * 0.15);
      guesses.push({ dimension, value: best.value, confidence, source: "classes", isDefault: best.value === def });
    } else if (def) {
      // Nenhuma opção bateu: provavelmente o padrão (ex.: opções sem classes)
      const emptyDefault = (options[def] ?? []).length === 0;
      guesses.push({ dimension, value: def, confidence: emptyDefault ? 0.75 : 0.4, source: "padrão", isDefault: true });
    }
  }
  return guesses;
}

// ---------------------------------------------------------------------------
// Identificação
// ---------------------------------------------------------------------------

function containment(base: string[], classes: Set<string>): number {
  const unique = [...new Set(base)];
  if (!unique.length) return 0;
  return unique.filter((c) => classes.has(c)).length / unique.length;
}

/** Pontua o quanto as classes do elemento batem com a definição (0–1). */
function scoreDef(ds: DesignSystemIndex, def: SlotDef, classes: Set<string>): number {
  const base = baseClassesFor(ds.ds, def);
  const config = variantConfigFor(ds.ds, def);
  let score = base.length ? containment(base, classes) : 0.5;
  if (config) {
    const options = Object.values(config.variants).map((opts) =>
      Math.max(0, ...Object.values(opts).map((list) => (list.length ? containment(list, classes) : 0))),
    );
    const avg = options.reduce((a, b) => a + b, 0) / Math.max(1, options.length);
    score = base.length ? score * 0.7 + avg * 0.3 : avg;
  }
  return score;
}

const BASE_NOVA_TELLS = [/^group\/button$/, /^has-data-\[icon/, /^data-\[size=/, /^\*:data-\[slot/];

function omniaFingerprints(classes: string[]): string[] {
  const hits: string[] = [];
  for (const raw of classes) {
    const { base } = parseClass(raw);
    const m = base.match(/^(?:bg|text|border|ring|fill|stroke|outline)-([a-z][\w-]*?)(?:\/\d+)?$/);
    if (m && isOmniaOnlyColor(m[1]) && /^(brand|info|success|warning|body-background|foreground-alt|card-hover|border-light|input-background|switch-background|overlay-\d+)/.test(m[1])) {
      hits.push(raw);
    }
  }
  return [...new Set(hits)];
}

const LUCIDE = /^lucide-([a-z0-9-]+)$/;

function nativeName(el: NodeRef): { name: string; reason: string } {
  const tag = el.tag;
  const icon = el.classes.map((c) => c.match(LUCIDE)?.[1]).find(Boolean);
  if (tag === "svg") {
    return icon
      ? { name: `Ícone ${pascal(icon)}`, reason: "Ícone lucide-react (classe lucide-*)" }
      : { name: "Ícone SVG", reason: "Elemento <svg>" };
  }
  const map: Record<string, string> = {
    a: "Link <a>",
    button: "Botão <button> nativo",
    input: `Campo <input type="${el.attrs.type ?? "text"}">`,
    textarea: "Área de texto <textarea>",
    select: "Seletor <select>",
    img: "Imagem <img>",
    p: "Parágrafo <p>",
    span: "Texto <span>",
    label: "Rótulo <label>",
    ul: "Lista <ul>",
    ol: "Lista <ol>",
    li: "Item de lista <li>",
    nav: "Navegação <nav>",
    header: "Cabeçalho <header>",
    footer: "Rodapé <footer>",
    main: "Conteúdo <main>",
    section: "Seção <section>",
    article: "Artigo <article>",
    aside: "Lateral <aside>",
    form: "Formulário <form>",
    table: "Tabela <table>",
    hr: "Divisor <hr>",
  };
  if (/^h[1-6]$/.test(tag)) return { name: `Título <${tag}>`, reason: "Elemento HTML nativo" };
  return { name: map[tag] ?? `Contêiner <${tag}>`, reason: "Nenhum data-slot, assinatura de classes ou componente React reconhecido" };
}

/** Equivalentes Omnia para elementos nativos. */
export const NATIVE_EQUIVALENTS: Record<string, string> = {
  button: "Button",
  textarea: "Textarea",
  select: "Select",
  table: "Table",
  label: "Label",
  hr: "Separator",
  kbd: "Kbd",
  progress: "Progress",
};

export function nativeEquivalent(el: NodeRef): string | undefined {
  if (el.tag === "input") {
    const type = el.attrs.type ?? "text";
    if (type === "checkbox") return el.attrs.role === "switch" ? "Switch" : "Checkbox";
    if (type === "radio") return "RadioGroup";
    if (type === "range") return "Slider";
    if (!["hidden", "file", "submit", "button", "image", "reset", "color"].includes(type)) return "Input";
    return undefined;
  }
  return NATIVE_EQUIVALENTS[el.tag];
}

const isMinified = (name?: string) => !name || name.length <= 2 || /^[a-z]$/.test(name) || /^_/.test(name);

/** Nomes de componentes internos que não interessam ao dev. */
const INTERNAL_COMPONENTS = /^(Primitive\..*|Slot|SlotClone|Slottable|Presence|Portal|DismissableLayer|FocusScope|Popper.*|Provider|Anonymous|ForwardRef|Memo|Suspense|Fragment|StrictMode|Context|Consumer|Collection.*|RovingFocus.*|Menu.*Impl|.*Impl|.*Provider|InnerLayoutRouter|RedirectBoundary|NotFoundBoundary|ErrorBoundary.*|LoadingBoundary|HotReload|Router|ScrollAndFocusHandler|RenderFromTemplateContext|OuterLayoutRouter|AppRouter|ServerRoot|Root)$/;

export function cleanOwners(owners?: string[]): string[] {
  return (owners ?? []).filter((n) => !isMinified(n) && !INTERNAL_COMPONENTS.test(n));
}

interface Candidate {
  ds: DesignSystemIndex;
  def: SlotDef;
  score: number;
  kind: ComponentKind;
}

export function identify(
  el: ElementSnapshot,
  k: KnowledgeIndex,
  opts: { usesOmniaTokens: boolean },
): ComponentIdentity {
  const classes = new Set(el.classes);
  const reasons: string[] = [];
  const reactName = el.react?.name && !isMinified(el.react.name) ? el.react.name : undefined;
  const owners = cleanOwners(el.react?.owners);
  const fingerprints = omniaFingerprints(el.classes);
  const baseNovaTells = el.classes.filter((c) => BASE_NOVA_TELLS.some((re) => re.test(c)));

  let winner: Candidate | undefined;
  let confidence = 0.5;
  let customSlot: string | undefined;

  if (el.slot) {
    reasons.push(`data-slot="${el.slot}"`);
    const omniaDef = k.omnia.ds.slots[el.slot];
    const shadcnDefs = k.shadcn
      .map((ds) => ({ ds, def: ds.ds.slots[el.slot!] }))
      .filter((x) => x.def);

    let omniaScore = omniaDef ? scoreDef(k.omnia, omniaDef, classes) : -1;
    if (omniaDef) {
      if (fingerprints.length) {
        omniaScore += 0.3;
        reasons.push(`Classes exclusivas do Omnia: ${fingerprints.slice(0, 3).join(", ")}`);
      }
      if (opts.usesOmniaTokens) omniaScore += 0.1;
      if (!shadcnDefs.length) omniaScore += 0.2;
    }
    let best: Candidate | undefined;
    for (const { ds, def } of shadcnDefs) {
      let score = scoreDef(ds, def, classes);
      if (baseNovaTells.length && ds.ds.id.includes("base-nova")) score += 0.3;
      if (!best || score > best.score) best = { ds, def, score, kind: "shadcn" };
    }
    if (omniaDef && (!best || omniaScore >= best.score - 0.05)) {
      winner = { ds: k.omnia, def: omniaDef, score: omniaScore, kind: "omnia" };
      confidence = Math.min(0.98, 0.6 + Math.max(0, omniaScore - (best?.score ?? 0)) * 0.6 + (omniaScore > 0.8 ? 0.15 : 0));
      reasons.push(`Classes batem ${Math.round(Math.min(1, scoreDef(k.omnia, omniaDef, classes)) * 100)}% com o ${omniaDef.part} do Omnia`);
    } else if (best) {
      winner = best;
      confidence = Math.min(0.95, 0.55 + Math.max(0, best.score - Math.max(0, omniaScore)) * 0.6);
      if (baseNovaTells.length) reasons.push(`Padrões shadcn base-nova: ${baseNovaTells.slice(0, 2).join(", ")}`);
      reasons.push(`Classes batem ${Math.round(Math.min(1, scoreDef(best.ds, best.def, classes)) * 100)}% com ${best.ds.ds.label}`);
    } else {
      customSlot = el.slot;
    }
  } else {
    // Sem data-slot: assinatura de classes (shadcn v3 / builds antigos).
    // O Omnia atual sempre emite data-slot, então só consideramos suas
    // assinaturas quando o nome React confirma a parte.
    let best: Candidate | undefined;
    const all = [
      ...k.omnia.ds.signatures.map((def) => ({ ds: k.omnia, def, kind: "omnia" as const })),
      ...k.shadcn.flatMap((ds) => ds.ds.signatures.map((def) => ({ ds, def, kind: "shadcn" as const }))),
    ];
    for (const c of all) {
      const base = [...new Set(baseClassesFor(c.ds.ds, c.def))];
      const nameConfirmed = !!reactName && reactName === c.def.part;
      if (reactName && !nameConfirmed) continue;
      if (c.def.slot && !nameConfirmed) continue;
      const matched = base.filter((cls) => classes.has(cls)).length;
      const score = base.length ? matched / base.length : 0;
      const ok = nameConfirmed ? score >= 0.6 : base.length >= 5 && matched >= 5 && score >= 0.85;
      if (ok && (!best || score > best.score)) best = { ...c, score };
    }
    if (best) {
      winner = best;
      confidence = Math.min(0.9, 0.45 + best.score * 0.4);
      reasons.push(`Sem data-slot; classes batem ${Math.round(Math.min(1, best.score) * 100)}% com a assinatura de ${best.def.part} (${best.ds.ds.label})`);
    } else if (reactName) {
      const omniaPart = [...k.omnia.parts].find((p) => p === reactName);
      if (omniaPart && (fingerprints.length || opts.usesOmniaTokens)) {
        const def = k.omnia.ds.signatures.find((s) => s.part === omniaPart) ?? Object.values(k.omnia.ds.slots).find((s) => s.part === omniaPart);
        if (def) {
          winner = { ds: k.omnia, def, score: 0.7, kind: "omnia" };
          confidence = 0.7;
          reasons.push(`Componente React "${reactName}" existe no Omnia DS`);
        }
      }
    }
  }

  if (reactName) reasons.push(`React: <${reactName}>`);

  if (winner) {
    const config = variantConfigFor(winner.ds.ds, winner.def);
    const variants = guessVariants(el.classes, config, el.attrs, el.react?.props ?? undefined);
    const known = allComponentClasses(winner.ds.ds, winner.def);
    const extraClasses = el.classes.filter((c) => !known.has(c) && !LUCIDE.test(c) && c !== "lucide");
    return {
      kind: winner.kind,
      name: winner.def.part,
      family: winner.def.family,
      part: winner.def.part !== winner.def.family ? winner.def.part : undefined,
      slot: el.slot,
      isSelf: true,
      confidence: Math.round(confidence * 100) / 100,
      reasons,
      summary: k.omnia.ds.docs[winner.def.part] ?? k.omnia.ds.docs[winner.def.family],
      variants,
      designSystem: winner.ds.ds.label,
      importPath:
        winner.kind === "omnia"
          ? winner.ds.ds.importPath
          : `${winner.ds.ds.importPath}/${winner.def.family.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase()}`,
      reactOwners: owners,
      extraClasses,
    };
  }

  if (customSlot) {
    reasons.push("Slot não existe no Omnia nem nas referências shadcn — componente local");
    return {
      kind: "shadcn",
      name: reactName ?? pascal(customSlot),
      slot: customSlot,
      isSelf: true,
      confidence: 0.5,
      reasons,
      variants: [],
      designSystem: "Componente local (padrão shadcn)",
      reactOwners: owners,
      extraClasses: el.classes,
    };
  }

  if (reactName) {
    reasons.push("Componente React da aplicação (não pertence ao DS)");
    return {
      kind: "react",
      name: reactName,
      isSelf: true,
      confidence: 0.8,
      reasons,
      variants: [],
      reactOwners: owners,
      extraClasses: el.classes,
    };
  }

  const native = nativeName(el);
  reasons.push(native.reason);
  return {
    kind: "native",
    name: native.name,
    isSelf: true,
    confidence: 0.9,
    reasons,
    variants: [],
    reactOwners: owners,
    extraClasses: el.classes,
  };
}

/** Rótulo curto de um nó para árvore/breadcrumb. */
export function nodeLabel(node: NodeRef, k: KnowledgeIndex): { label: string; kind: ComponentKind } {
  if (node.slot) {
    const omnia = k.omnia.ds.slots[node.slot];
    if (omnia) return { label: omnia.part, kind: "omnia" };
    for (const ds of k.shadcn) {
      const def = ds.ds.slots[node.slot];
      if (def) return { label: def.part, kind: "shadcn" };
    }
    return { label: pascal(node.slot), kind: "shadcn" };
  }
  const reactName = node.react?.name;
  if (reactName && !isMinified(reactName)) return { label: reactName, kind: "react" };
  const icon = node.classes.map((c) => c.match(LUCIDE)?.[1]).find(Boolean);
  if (icon) return { label: pascal(icon), kind: "native" };
  const id = node.attrs.id ? `#${node.attrs.id}` : "";
  return { label: `${node.tag}${id}`, kind: "native" };
}
