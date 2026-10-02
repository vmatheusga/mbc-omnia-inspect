import { rectOf, type Box } from "./frames";
import type { Line } from "./measure";

const BLUE = "#0d99ff";
const RED = "#f24e1e";

const STYLE = `
  :host { all: initial; }
  .layer { position: fixed; inset: 0; pointer-events: none; z-index: 2147483647; }
  .shield { position: fixed; inset: 0; display: none; pointer-events: auto; cursor: crosshair; background: transparent; }
  .box { position: fixed; box-sizing: border-box; pointer-events: none; display: none; }
  .hover { border: 1px solid ${BLUE}; background: rgb(13 153 255 / 0.08); }
  .hover.discreet { border: 1px dashed rgb(13 153 255 / 0.6); background: transparent; }
  .selected { border: 2px solid ${BLUE}; }
  .selected.secondary { border-width: 1.5px; }
  .margin { border-style: solid; border-color: rgb(246 178 107 / 0.35); }
  .padding { border-style: solid; border-color: rgb(147 196 125 / 0.45); }
  .content { background: rgb(111 168 220 / 0.18); }
  .highlight { border: 1px dashed ${BLUE}; background: rgb(13 153 255 / 0.12); }
  .label {
    position: fixed; display: none; pointer-events: none; white-space: nowrap;
    font: 500 11px/1.2 Inter, ui-sans-serif, system-ui, -apple-system, sans-serif;
    color: #fff; background: ${BLUE}; padding: 3px 6px; border-radius: 4px;
    box-shadow: 0 2px 6px rgb(0 0 0 / 0.2);
  }
  .label .dim { opacity: 0.75; margin-left: 6px; font-variant-numeric: tabular-nums; }
  .label.selected-label { background: #0b7fd4; }
  .label.secondary { background: #0b7fd4; opacity: 0.85; font-size: 10px; padding: 2px 5px; }
  .label.discreet { background: rgb(13 153 255 / 0.75); font-size: 10px; padding: 2px 5px; box-shadow: none; }
  .line { position: fixed; pointer-events: none; background: ${RED}; }
  .line.guide { background: none; border: 0 dashed ${RED}; }
  .line-label {
    position: fixed; pointer-events: none; white-space: nowrap; transform: translate(-50%, -50%);
    font: 600 11px/1 Inter, ui-sans-serif, system-ui, -apple-system, sans-serif; font-variant-numeric: tabular-nums;
    color: #fff; background: ${RED}; padding: 3px 5px; border-radius: 3px;
  }
`;

type Rect = { top: number; left: number; width: number; height: number };

function place(el: HTMLElement, r: Rect) {
  el.style.display = "block";
  el.style.top = `${r.top}px`;
  el.style.left = `${r.left}px`;
  el.style.width = `${Math.max(0, r.width)}px`;
  el.style.height = `${Math.max(0, r.height)}px`;
}

export interface SelectionItem {
  el: Element;
  label: string;
  primary: boolean;
}

export class Overlay {
  private host: HTMLElement;
  private root: ShadowRoot;
  private layer: HTMLElement;
  private hoverBox: HTMLElement;
  private hoverLabel: HTMLElement;
  private marginBox: HTMLElement;
  private paddingBox: HTMLElement;
  private contentBox: HTMLElement;
  private highlightBox: HTMLElement;
  private shield: HTMLElement;
  /** Caixas e etiquetas reutilizadas para a multi-seleção. */
  private selectionPool: Array<{ box: HTMLElement; label: HTMLElement }> = [];
  private measureLayer: HTMLElement;

  constructor() {
    this.host = document.createElement("omnia-inspect-overlay");
    this.root = this.host.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    style.textContent = STYLE;
    this.layer = document.createElement("div");
    this.layer.className = "layer";
    const make = (cls: string) => {
      const d = document.createElement("div");
      d.className = cls;
      this.layer.append(d);
      return d;
    };
    this.shield = make("shield");
    this.marginBox = make("box margin");
    this.paddingBox = make("box padding");
    this.contentBox = make("box content");
    this.highlightBox = make("box highlight");
    this.hoverBox = make("box hover");
    this.measureLayer = make("measure");
    this.hoverLabel = make("label");
    this.root.append(style, this.layer);
    this.host.dataset.selectedCount = "0";
    this.host.dataset.measureCount = "0";
    document.documentElement.append(this.host);
  }

  isOverlay(el: Element | null) {
    return el === this.host;
  }

  /**
   * Película transparente sobre a página durante a inspeção: a página não
   * recebe :hover nem cliques, e o alvo é resolvido por elementsFromPoint.
   */
  setShield(on: boolean, bounds?: DOMRect | null) {
    this.shield.style.display = on ? "block" : "none";
    if (on && bounds) {
      Object.assign(this.shield.style, {
        inset: "auto",
        top: `${bounds.top}px`,
        left: `${bounds.left}px`,
        width: `${bounds.width}px`,
        height: `${bounds.height}px`,
      });
    }
  }

  /** Elemento da página sob o ponto, ignorando o overlay. */
  elementAt(x: number, y: number): Element | null {
    return document.elementsFromPoint(x, y).find((el) => el !== this.host) ?? null;
  }

  /** Some durante prints e gravações. */
  setHidden(hidden: boolean) {
    this.host.style.display = hidden ? "none" : "";
  }

  /** O overlay precisa ficar acima do palco responsivo: re-anexa ao final. */
  bringToFront() {
    if (this.host.nextSibling) document.documentElement.append(this.host);
  }

  private setLabel(label: HTMLElement, rect: Box, text: string, withDims = true) {
    label.textContent = "";
    const name = document.createElement("span");
    name.textContent = text;
    label.append(name);
    if (withDims) {
      const dim = document.createElement("span");
      dim.className = "dim";
      dim.textContent = `${Math.round(rect.width / rect.scale)} × ${Math.round(rect.height / rect.scale)}`;
      label.append(dim);
    }
    label.style.display = "block";
    const h = label.offsetHeight || 20;
    const top = rect.top - h - 4 >= 0 ? rect.top - h - 4 : rect.top + rect.height + 4;
    const maxLeft = window.innerWidth - label.offsetWidth - 4;
    label.style.top = `${Math.min(top, window.innerHeight - h - 4)}px`;
    label.style.left = `${Math.max(4, Math.min(rect.left, maxLeft))}px`;
  }

  /** `discreet`: há seleção ativa; o hover fica tracejado e sem preenchimento. */
  showHover(el: Element, text: string, opts: { discreet?: boolean } = {}) {
    const rect = rectOf(el);
    this.hoverBox.classList.toggle("discreet", !!opts.discreet);
    this.hoverLabel.className = `label${opts.discreet ? " discreet" : ""}`;
    place(this.hoverBox, rect);
    this.setLabel(this.hoverLabel, rect, text, !opts.discreet);
  }

  hideHover() {
    this.hoverBox.style.display = "none";
    this.hoverLabel.style.display = "none";
  }

  private poolItem(i: number) {
    while (this.selectionPool.length <= i) {
      const box = document.createElement("div");
      const label = document.createElement("div");
      // antes do hover, para o hover ficar por cima
      this.layer.insertBefore(box, this.hoverBox);
      this.layer.insertBefore(label, this.hoverLabel);
      this.selectionPool.push({ box, label });
    }
    return this.selectionPool[i];
  }

  /** Todos os selecionados com contorno; margin/padding só no primário. */
  showSelections(items: SelectionItem[]) {
    items.forEach((item, i) => {
      const { box, label } = this.poolItem(i);
      const rect = rectOf(item.el);
      box.className = `box selected${item.primary ? "" : " secondary"}`;
      label.className = `label ${item.primary ? "selected-label" : "secondary"}`;
      place(box, rect);
      this.setLabel(label, rect, item.label, item.primary);
      if (item.primary) this.showBoxModel(item.el, rect);
    });
    for (let i = items.length; i < this.selectionPool.length; i++) {
      this.selectionPool[i].box.style.display = "none";
      this.selectionPool[i].label.style.display = "none";
    }
    if (!items.some((i) => i.primary)) this.hideBoxModel();
    this.host.dataset.selectedCount = String(items.length);
  }

  private showBoxModel(el: Element, rect: Box) {
    const s = getComputedStyle(el);
    const n = (v: string) => (parseFloat(v) || 0) * rect.scale;
    const m = { t: n(s.marginTop), r: n(s.marginRight), b: n(s.marginBottom), l: n(s.marginLeft) };
    const b = { t: n(s.borderTopWidth), r: n(s.borderRightWidth), b: n(s.borderBottomWidth), l: n(s.borderLeftWidth) };
    const p = { t: n(s.paddingTop), r: n(s.paddingRight), b: n(s.paddingBottom), l: n(s.paddingLeft) };
    place(this.marginBox, {
      top: rect.top - m.t,
      left: rect.left - m.l,
      width: rect.width + m.l + m.r,
      height: rect.height + m.t + m.b,
    });
    this.marginBox.style.borderWidth = `${m.t}px ${m.r}px ${m.b}px ${m.l}px`;
    place(this.paddingBox, {
      top: rect.top + b.t,
      left: rect.left + b.l,
      width: rect.width - b.l - b.r,
      height: rect.height - b.t - b.b,
    });
    this.paddingBox.style.borderWidth = `${p.t}px ${p.r}px ${p.b}px ${p.l}px`;
    place(this.contentBox, {
      top: rect.top + b.t + p.t,
      left: rect.left + b.l + p.l,
      width: rect.width - b.l - b.r - p.l - p.r,
      height: rect.height - b.t - b.b - p.t - p.b,
    });
  }

  private hideBoxModel() {
    for (const el of [this.marginBox, this.paddingBox, this.contentBox]) el.style.display = "none";
  }

  hideSelection() {
    this.showSelections([]);
  }

  /** Linhas vermelhas de distância (Alt/Option). */
  showMeasure(lines: Line[]) {
    const nodes: HTMLElement[] = [];
    for (const line of lines) {
      const horizontal = line.y1 === line.y2;
      const el = document.createElement("div");
      el.className = `line${line.guide ? " guide" : ""}`;
      const left = Math.min(line.x1, line.x2);
      const top = Math.min(line.y1, line.y2);
      Object.assign(el.style, {
        left: `${left}px`,
        top: `${top}px`,
        width: horizontal ? `${Math.abs(line.x2 - line.x1)}px` : "1px",
        height: horizontal ? "1px" : `${Math.abs(line.y2 - line.y1)}px`,
      });
      if (line.guide) el.style[horizontal ? "borderTopWidth" : "borderLeftWidth"] = "1px";
      nodes.push(el);
      if (!line.guide && line.label > 0) {
        const tag = document.createElement("div");
        tag.className = "line-label";
        tag.textContent = String(line.label);
        tag.style.left = `${(line.x1 + line.x2) / 2}px`;
        tag.style.top = `${(line.y1 + line.y2) / 2}px`;
        nodes.push(tag);
      }
    }
    this.measureLayer.replaceChildren(...nodes);
    this.host.dataset.measureCount = String(lines.filter((l) => !l.guide).length);
  }

  hideMeasure() {
    if (!this.measureLayer.childElementCount) return;
    this.measureLayer.replaceChildren();
    this.host.dataset.measureCount = "0";
  }

  showHighlight(el: Element | null) {
    if (!el) {
      this.highlightBox.style.display = "none";
      return;
    }
    place(this.highlightBox, rectOf(el));
  }

  destroy() {
    this.host.remove();
  }
}
