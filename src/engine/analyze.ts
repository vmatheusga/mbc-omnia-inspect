import { analyzeA11y } from "./a11y";
import { audit } from "./audit";
import { identify, nodeLabel } from "./identify";
import { buildTokenIndex, pageUsesOmniaTokens, type KnowledgeIndex } from "./knowledge";
import { buildBoxModel } from "./boxmodel";
import { buildProperties } from "./properties";
import { buildSnippets } from "./snippet";
import { currentBreakpoint, responsiveRules } from "./tailwind";
import { analyzeTokens } from "./tokens";
import type { Finding, InspectInput, InspectionResult, NodeRef, TreeNode } from "./types";

const SEVERITY_ORDER = { error: 0, warning: 1, info: 2 } as const;

function selectorOf(el: NodeRef): string {
  const id = el.attrs.id ? `#${el.attrs.id}` : "";
  const slot = el.slot ? `[data-slot="${el.slot}"]` : "";
  const cls = !id && !slot ? el.classes.slice(0, 2).map((c) => `.${c.replace(/([:/\[\]().%&>*=,'"])/g, "\\$1")}`).join("") : "";
  return `${el.tag}${id}${slot}${cls}`;
}

function toTree(nodes: NodeRef[], k: KnowledgeIndex): TreeNode[] {
  return nodes.map((n) => {
    const { label, kind } = nodeLabel(n, k);
    return { id: n.id, label, kind, detail: n.slot ? `data-slot=${n.slot}` : n.tag };
  });
}

export function analyze(input: InspectInput, k: KnowledgeIndex): InspectionResult {
  const { element: el, page } = input;
  const usesOmniaTokens = pageUsesOmniaTokens(page);
  const index = buildTokenIndex(k.raw, page);

  const component = identify(el, k, { usesOmniaTokens });
  const viewportWidth = page.viewportWidth ?? 1280;
  const tokens = analyzeTokens(el, index, viewportWidth);
  const boxModel = buildBoxModel(el, index, viewportWidth);
  const { info: a11y, findings: a11yFindings } = analyzeA11y(el);
  const findings: Finding[] = [
    ...audit(el, component, tokens, index, k, { usesOmniaTokens }),
    ...a11yFindings,
  ].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

  return {
    element: {
      id: el.id,
      tag: el.tag,
      selector: selectorOf(el),
      text: el.text,
      width: Math.round(el.rect.width),
      height: Math.round(el.rect.height),
    },
    component,
    tokens: tokens.usages,
    stateTokens: tokens.stateTokens,
    findings,
    a11y,
    code: buildSnippets(el, component, tokens.usages),
    tree: { ancestors: toTree(input.ancestors, k), children: toTree(input.children, k) },
    page: {
      theme: page.theme,
      url: page.url,
      usesOmniaTokens,
      viewportWidth: page.viewportWidth,
      breakpoint: currentBreakpoint(viewportWidth),
    },
    responsive: responsiveRules(el.classes, viewportWidth),
    boxModel,
    properties: buildProperties({
      el,
      usages: tokens.usages,
      box: boxModel,
      theme: page.theme,
      viewportWidth,
      usesOmniaTokens,
    }),
  };
}

/** Identificação rápida para o rótulo do hover. */
export function quickLabel(input: Pick<InspectInput, "element" | "page">, k: KnowledgeIndex): string {
  const component = identify(input.element, k, { usesOmniaTokens: pageUsesOmniaTokens(input.page) });
  const variants = component.variants.filter((v) => !v.isDefault).map((v) => v.value);
  return [component.name, ...variants].join(" · ");
}
