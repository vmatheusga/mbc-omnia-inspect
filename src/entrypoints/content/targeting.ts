/**
 * Alvo "inteligente" no estilo Figma: o clique seleciona o componente mais
 * próximo; Ctrl/⌘ seleciona a camada exata; duplo clique desce um nível.
 */

const ROLES = /^(button|link|tab|menuitem|menuitemcheckbox|menuitemradio|checkbox|switch|option|radio|combobox|slider)$/;
const TAGS = /^(svg|img|video|button|input|select|textarea|label|picture|canvas)$/i;
const MAX_LEVELS = 8;

/** Partes internas de um SVG viram o <svg> inteiro; <html> não é alvo. */
export function normalizeTarget(el: Element | null): Element | null {
  if (!el) return null;
  const svg = el.closest("svg");
  if (svg && el !== svg) return svg;
  if (el === el.ownerDocument.documentElement) return null;
  return el;
}

export function isComponentRoot(el: Element): boolean {
  if (el.hasAttribute("data-slot")) return true;
  if (TAGS.test(el.tagName)) return true;
  if (el.tagName === "A" && el.hasAttribute("href")) return true;
  const role = el.getAttribute("role");
  return !!role && ROLES.test(role);
}

const isBoundary = (el: Element) => el === el.ownerDocument.body || el === el.ownerDocument.documentElement;

/** Componente mais próximo (ancestral ou o próprio); `deep` devolve a camada exata. */
export function resolveTarget(exact: Element | null, opts: { deep?: boolean } = {}): Element | null {
  const base = normalizeTarget(exact);
  if (!base || opts.deep) return base;
  let current: Element | null = base;
  for (let level = 0; current && level <= MAX_LEVELS && !isBoundary(current); level++) {
    if (isComponentRoot(current)) return current;
    current = current.parentElement;
  }
  return base;
}

/** Próximo nível entre `selected` e `exact` (duplo clique). */
export function descendToward(selected: Element, exact: Element | null): Element | null {
  const target = normalizeTarget(exact);
  if (!target || target === selected || !selected.contains(target)) return null;
  // caminho de selected (exclusivo) até target (inclusivo)
  const path: Element[] = [];
  for (let el: Element | null = target; el && el !== selected; el = el.parentElement) path.unshift(el);
  return path.find(isComponentRoot) ?? path[0] ?? null;
}
