/**
 * Geometria através de iframes da mesma origem (inclusive escalados com
 * transform), usada pelo palco responsivo: o overlay vive no documento do
 * topo, mas o elemento inspecionado pode estar dentro de uma moldura.
 */

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
  /** Escala acumulada dos iframes (1 = sem zoom). */
  scale: number;
}

function frameScale(frame: Element): number {
  const html = frame as HTMLElement;
  const rect = frame.getBoundingClientRect();
  return html.offsetWidth ? rect.width / html.offsetWidth : 1;
}

/** Retângulo do elemento em coordenadas da janela do topo. */
export function rectOf(el: Element): Box {
  const r = el.getBoundingClientRect();
  let box: Box = { left: r.left, top: r.top, width: r.width, height: r.height, scale: 1 };
  let win = el.ownerDocument.defaultView;
  while (win && win.frameElement && win !== window) {
    const frame = win.frameElement;
    const fr = frame.getBoundingClientRect();
    const s = frameScale(frame);
    const clientLeft = (frame as HTMLElement).clientLeft * s;
    const clientTop = (frame as HTMLElement).clientTop * s;
    box = {
      left: fr.left + clientLeft + box.left * s,
      top: fr.top + clientTop + box.top * s,
      width: box.width * s,
      height: box.height * s,
      scale: box.scale * s,
    };
    win = frame.ownerDocument.defaultView;
  }
  return box;
}

/** Documento acessível de um iframe (mesma origem e já carregado). */
export function frameDocument(el: Element | null): Document | null {
  if (!(el instanceof HTMLIFrameElement)) return null;
  try {
    const doc = el.contentDocument;
    return doc && doc.documentElement ? doc : null;
  } catch {
    return null;
  }
}

/** Desce do ponto (x, y) do topo para o elemento dentro de iframes. */
export function descendIntoFrames(el: Element | null, x: number, y: number): Element | null {
  return descendIntoFramesAt(el, x, y).el;
}

/** Como `descendIntoFrames`, devolvendo também o ponto no sistema do documento final. */
export function descendIntoFramesAt(el: Element | null, x: number, y: number): { el: Element | null; x: number; y: number } {
  let current = el;
  let px = x;
  let py = y;
  for (let depth = 0; depth < 5; depth++) {
    const doc = frameDocument(current);
    if (!doc || !current) return { el: current, x: px, y: py };
    const fr = current.getBoundingClientRect();
    const s = frameScale(current);
    px = (px - fr.left - (current as HTMLElement).clientLeft * s) / s;
    py = (py - fr.top - (current as HTMLElement).clientTop * s) / s;
    const inner = doc.elementFromPoint(px, py);
    if (!inner) return { el: current, x: px, y: py };
    current = inner;
  }
  return { el: current, x: px, y: py };
}

/**
 * Camada mais profunda sob o ponto pela geometria dos filhos — alcança
 * elementos com `pointer-events: none` (ex.: ícones dentro de botões).
 */
export function deepestAt(el: Element, x: number, y: number): Element {
  let current = el;
  for (let depth = 0; depth < 30; depth++) {
    const children = [...current.children].reverse();
    const hit = children.find((child) => {
      const r = child.getBoundingClientRect();
      if (!r.width || !r.height || x < r.left || x > r.right || y < r.top || y > r.bottom) return false;
      const style = getComputedStyle(child);
      return style.visibility !== "hidden" && style.display !== "none";
    });
    if (!hit) return current;
    current = hit;
  }
  return current;
}

export const viewOf = (el: Element): Window => el.ownerDocument.defaultView ?? window;
