import { blend, isTransparent, parseColor, toCss, type RGBA } from "../../engine/color";
import type { ElementSnapshot, InspectInput, NodeRef, PageContext, ReactInfo } from "../../engine/types";
import knowledge from "../../knowledge/token-names.generated.json";
import { PROBE_ATTR, PROBE_REQUEST, PROBE_RESPONSE, type ProbeResponse } from "../../shared/messages";

// ---------------------------------------------------------------------------
// Registro de ids ↔ elementos (para o painel referenciar nós)
// ---------------------------------------------------------------------------

const ids = new WeakMap<Element, string>();
const refs = new Map<string, WeakRef<Element>>();
let counter = 0;

export function idOf(el: Element): string {
  let id = ids.get(el);
  if (!id) {
    id = `n${++counter}`;
    ids.set(el, id);
    refs.set(id, new WeakRef(el));
  }
  return id;
}

export function elementById(id: string): Element | undefined {
  const el = refs.get(id)?.deref();
  return el?.isConnected ? el : undefined;
}

// ---------------------------------------------------------------------------

const STYLE_PROPS = [
  "color",
  "background-color",
  "background-image",
  "border-top-width",
  "border-right-width",
  "border-bottom-width",
  "border-left-width",
  "border-top-color",
  "border-right-color",
  "border-bottom-color",
  "border-left-color",
  "border-top-left-radius",
  "border-top-right-radius",
  "border-bottom-right-radius",
  "border-bottom-left-radius",
  "box-shadow",
  "outline-color",
  "outline-width",
  "font-family",
  "font-size",
  "font-weight",
  "line-height",
  "letter-spacing",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "margin-top",
  "margin-right",
  "margin-bottom",
  "margin-left",
  "row-gap",
  "column-gap",
  "width",
  "height",
  "opacity",
  "display",
  "position",
  "cursor",
  "fill",
  "stroke",
  "visibility",
  "box-sizing",
  "flex-direction",
  "flex-wrap",
  "align-items",
  "justify-content",
  "align-self",
  "flex-grow",
  "flex-shrink",
  "flex-basis",
  "grid-template-columns",
  "grid-template-rows",
  "min-width",
  "max-width",
  "min-height",
  "max-height",
  "top",
  "right",
  "bottom",
  "left",
  "z-index",
  "overflow-x",
  "overflow-y",
  "text-align",
  "text-transform",
  "text-decoration-line",
  "border-top-style",
];

const classesOf = (el: Element) => (el.getAttribute("class") ?? "").split(/\s+/).filter(Boolean);

function attrsOf(el: Element): Record<string, string> {
  const out: Record<string, string> = {};
  for (const attr of Array.from(el.attributes)) {
    if (attr.name === "class" || attr.name === "style" || attr.name === PROBE_ATTR) continue;
    out[attr.name] = attr.value.slice(0, 200);
  }
  return out;
}

function textOf(el: Element): string | undefined {
  const text = (el.textContent ?? "").replace(/\s+/g, " ").trim();
  return text ? text.slice(0, 80) : undefined;
}

export function nodeRef(el: Element, react?: ReactInfo): NodeRef {
  return {
    id: idOf(el),
    tag: el.tagName.toLowerCase(),
    slot: el.getAttribute("data-slot") ?? undefined,
    classes: classesOf(el),
    attrs: attrsOf(el),
    text: textOf(el),
    react,
  };
}

function effectiveBackground(el: Element): string {
  const layers: RGBA[] = [];
  let current: Element | null = el;
  while (current) {
    const color = parseColor(getComputedStyle(current).backgroundColor);
    if (color && !isTransparent(color)) {
      layers.push(color);
      if (color.a >= 1) break;
    }
    current = current.parentElement;
  }
  let result: RGBA = { r: 255, g: 255, b: 255, a: 1 };
  for (const layer of layers.reverse()) result = layer.a >= 1 ? layer : blend(layer, result);
  return toCss(result);
}

function accessibleName(el: Element): string {
  const aria = el.getAttribute("aria-label");
  if (aria?.trim()) return aria.trim();
  const labelledBy = el.getAttribute("aria-labelledby");
  if (labelledBy) {
    const text = labelledBy
      .split(/\s+/)
      .map((id) => el.ownerDocument.getElementById(id)?.textContent?.trim() ?? "")
      .join(" ")
      .trim();
    if (text) return text;
  }
  if (el.tagName === "IMG") return (el as HTMLImageElement).alt;
  // Elementos rotuláveis: <label for> ou <label> envolvente
  if (/^(BUTTON|INPUT|SELECT|TEXTAREA|METER|OUTPUT|PROGRESS)$/.test(el.tagName)) {
    const label = (el.id && el.ownerDocument.querySelector(`label[for="${CSS.escape(el.id)}"]`)) || el.closest("label");
    if (label?.textContent?.trim()) return label.textContent.trim();
  }
  if ((el.tagName === "INPUT" || el.tagName === "TEXTAREA") && (el as HTMLInputElement).placeholder) {
    return (el as HTMLInputElement).placeholder;
  }
  const svgTitle = el.querySelector(":scope > title");
  if (svgTitle?.textContent) return svgTitle.textContent.trim();
  const text = (el as HTMLElement).innerText ?? el.textContent ?? "";
  if (text.trim()) return text.replace(/\s+/g, " ").trim().slice(0, 120);
  return el.getAttribute("title") ?? "";
}

function hasDirectText(el: Element): boolean {
  return Array.from(el.childNodes).some((n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim());
}

export function pageContext(el: Element, tokenNames: string[] = knowledge): PageContext {
  const style = getComputedStyle(el);
  const tokenValues: Record<string, string> = {};
  for (const name of tokenNames) {
    const value = style.getPropertyValue(name).trim();
    if (value) tokenValues[name] = value;
  }
  const darkScope = el.closest(".dark, [data-theme='dark'], [data-mode='dark']");
  const lightScope = el.closest(".light, [data-theme='light']");
  const theme =
    darkScope && (!lightScope || darkScope.contains(lightScope) === false) ? "dark" : "light";
  return {
    url: (el.ownerDocument.defaultView ?? window).location.href,
    theme,
    rootFontSize: parseFloat(getComputedStyle(el.ownerDocument.documentElement).fontSize) || 16,
    tokenValues,
    viewportWidth: (el.ownerDocument.defaultView ?? window).innerWidth,
  };
}

export function snapshot(el: Element, react?: ReactInfo): ElementSnapshot {
  const style = getComputedStyle(el);
  const styles: Record<string, string> = {};
  for (const prop of STYLE_PROPS) styles[prop] = style.getPropertyValue(prop);
  const parent = el.parentElement;
  const parentStyle = parent ? getComputedStyle(parent) : undefined;
  const rect = el.getBoundingClientRect();
  const html = el as HTMLElement;
  const disabled = (el as HTMLButtonElement).disabled === true;

  return {
    ...nodeRef(el, react),
    inlineStyle: el.getAttribute("style") ?? undefined,
    styles,
    parentColor: parentStyle?.color,
    parentStyles: parentStyle
      ? {
          "font-size": parentStyle.fontSize,
          display: parentStyle.display,
          "flex-direction": parentStyle.flexDirection,
          "align-items": parentStyle.alignItems,
          // área de conteúdo do pai (para detectar "preenchimento")
          "content-width": String(
            parent!.clientWidth - (parseFloat(parentStyle.paddingLeft) || 0) - (parseFloat(parentStyle.paddingRight) || 0),
          ),
          "content-height": String(
            parent!.clientHeight - (parseFloat(parentStyle.paddingTop) || 0) - (parseFloat(parentStyle.paddingBottom) || 0),
          ),
        }
      : undefined,
    rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
    effectiveBackground: effectiveBackground(el),
    accessibleName: accessibleName(el),
    hasDirectText: hasDirectText(el),
    focusable: typeof html.tabIndex === "number" && html.tabIndex >= 0 && !disabled,
    cursorPointer: style.cursor === "pointer",
    childElementCount: el.childElementCount,
  };
}

// ---------------------------------------------------------------------------
// React probe (main world)
// ---------------------------------------------------------------------------

export function requestReactInfo(el: Element, timeout = 150): Promise<ReactInfo | undefined> {
  const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  el.setAttribute(PROBE_ATTR, requestId);
  return new Promise((resolve) => {
    const done = (info?: ReactInfo) => {
      window.removeEventListener("message", onMessage);
      el.removeAttribute(PROBE_ATTR);
      clearTimeout(timer);
      resolve(info);
    };
    const onMessage = (event: MessageEvent) => {
      const data = event.data as ProbeResponse | undefined;
      if (event.source === window && data?.source === PROBE_RESPONSE && data.requestId === requestId) {
        done(data.info);
      }
    };
    const timer = setTimeout(() => done(undefined), timeout);
    window.addEventListener("message", onMessage);
    window.postMessage({ source: PROBE_REQUEST, requestId }, "*");
  });
}

// ---------------------------------------------------------------------------

export async function buildInput(el: Element): Promise<InspectInput> {
  const react = await requestReactInfo(el);
  const ancestors: NodeRef[] = [];
  let parent = el.parentElement;
  while (parent && parent !== el.ownerDocument.documentElement && ancestors.length < 30) {
    ancestors.push(nodeRef(parent));
    parent = parent.parentElement;
  }
  const children = Array.from(el.children)
    .slice(0, 40)
    .map((child) => nodeRef(child));
  return { element: snapshot(el, react), ancestors, children, page: pageContext(el) };
}
