import { contrastRatio, formatColor, isTransparent, parseColor } from "./color";
import type { A11yInfo, ElementSnapshot, Finding } from "./types";

const IMPLICIT_ROLES: Record<string, string> = {
  a: "link",
  article: "article",
  aside: "complementary",
  button: "button",
  dialog: "dialog",
  footer: "contentinfo",
  form: "form",
  h1: "heading",
  h2: "heading",
  h3: "heading",
  h4: "heading",
  h5: "heading",
  h6: "heading",
  header: "banner",
  hr: "separator",
  img: "img",
  li: "listitem",
  main: "main",
  nav: "navigation",
  ol: "list",
  progress: "progressbar",
  section: "region",
  select: "combobox",
  table: "table",
  textarea: "textbox",
  ul: "list",
};

const INPUT_ROLES: Record<string, string> = {
  checkbox: "checkbox",
  radio: "radio",
  range: "slider",
  button: "button",
  submit: "button",
  reset: "button",
  search: "searchbox",
  number: "spinbutton",
};

const INTERACTIVE_ROLES = new Set([
  "button",
  "link",
  "checkbox",
  "radio",
  "switch",
  "tab",
  "menuitem",
  "menuitemcheckbox",
  "menuitemradio",
  "option",
  "combobox",
  "textbox",
  "searchbox",
  "slider",
  "spinbutton",
]);

const STATE_ATTRS = [
  "data-state",
  "data-disabled",
  "data-active",
  "data-highlighted",
  "data-orientation",
  "data-side",
  "data-align",
  "data-variant",
  "data-size",
  "data-inset",
  "data-collapsible",
  "disabled",
  "readonly",
  "required",
  "checked",
  "open",
];

export function roleOf(el: ElementSnapshot): { role?: string; implicit: boolean } {
  if (el.attrs.role) return { role: el.attrs.role, implicit: false };
  if (el.tag === "input") return { role: INPUT_ROLES[el.attrs.type ?? "text"] ?? "textbox", implicit: true };
  if (el.tag === "a" && !("href" in el.attrs)) return { role: undefined, implicit: true };
  return { role: IMPLICIT_ROLES[el.tag], implicit: true };
}

export function analyzeA11y(el: ElementSnapshot): { info: A11yInfo; findings: Finding[] } {
  const findings: Finding[] = [];
  const { role, implicit } = roleOf(el);

  const states = STATE_ATTRS.filter((k) => k in el.attrs).map((key) => ({
    key,
    value: el.attrs[key] || "true",
  }));
  const aria = Object.entries(el.attrs)
    .filter(([k]) => k.startsWith("aria-"))
    .map(([key, value]) => ({ key, value }));

  const info: A11yInfo = {
    role,
    implicitRole: implicit,
    name: el.accessibleName || undefined,
    focusable: el.focusable,
    tabIndex: el.attrs.tabindex,
    states,
    aria,
  };

  // Contraste (apenas quando o elemento tem texto próprio)
  const fg = parseColor(el.styles.color);
  const bg = parseColor(el.effectiveBackground);
  if (el.hasDirectText && fg && bg && !isTransparent(fg)) {
    const ratio = contrastRatio(fg, bg);
    const size = parseFloat(el.styles["font-size"] ?? "16");
    const weight = parseFloat(el.styles["font-weight"] ?? "400");
    const largeText = size >= 24 || (size >= 18.66 && weight >= 700);
    const aaMin = largeText ? 3 : 4.5;
    const aaaMin = largeText ? 4.5 : 7;
    info.contrast = {
      ratio: Math.round(ratio * 100) / 100,
      foreground: formatColor(fg),
      background: formatColor(bg),
      largeText,
      aa: ratio >= aaMin,
      aaa: ratio >= aaaMin,
    };
    const disabled = "disabled" in el.attrs || "data-disabled" in el.attrs || el.attrs["aria-disabled"] === "true";
    if (ratio < aaMin && !disabled) {
      findings.push({
        severity: ratio < 3 ? "error" : "warning",
        category: "a11y",
        title: `Contraste insuficiente (${ratio.toFixed(2)}:1)`,
        detail: `${formatColor(fg)} sobre ${formatColor(bg)} — mínimo WCAG AA é ${aaMin}:1 para ${largeText ? "texto grande" : "texto normal"}.`,
      });
    }
  }

  const interactive = role ? INTERACTIVE_ROLES.has(role) : false;
  if (interactive && !el.accessibleName?.trim()) {
    findings.push({
      severity: "error",
      category: "a11y",
      title: "Elemento interativo sem nome acessível",
      detail: "Leitores de tela vão anunciar apenas o papel (ex.: “botão”).",
      suggestion: "Adicione texto visível, aria-label ou aria-labelledby.",
    });
  }
  if (el.tag === "img" && !("alt" in el.attrs)) {
    findings.push({
      severity: "error",
      category: "a11y",
      title: "Imagem sem atributo alt",
      suggestion: 'Use alt="" se for decorativa, ou uma descrição curta.',
    });
  }
  if (el.cursorPointer && !interactive && !el.focusable && ["div", "span", "li", "td", "img", "svg"].includes(el.tag)) {
    findings.push({
      severity: "warning",
      category: "a11y",
      title: "Parece clicável, mas não é acessível por teclado",
      detail: `<${el.tag}> com cursor: pointer, sem role nem tabindex.`,
      suggestion: "Use <Button> (ou <button>) ou adicione role e tabindex=0 com suporte a Enter/Espaço.",
    });
  }
  const tabindex = parseInt(el.attrs.tabindex ?? "", 10);
  if (tabindex > 0) {
    findings.push({
      severity: "warning",
      category: "a11y",
      title: `tabindex="${tabindex}" altera a ordem natural de foco`,
      suggestion: 'Prefira tabindex="0" ou "-1".',
    });
  }
  return { info, findings };
}
