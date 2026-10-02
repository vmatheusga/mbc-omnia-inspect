/**
 * Preparação da página para prints e gravações: esconde o overlay e o palco,
 * aplica o tema, congela animações, carrega imagens lazy, expande a rolagem
 * interna, mede o elemento e faz o auto scroll. Tudo é desfeito ao sair.
 */
import type {
  AutoscrollOptions,
  CaptureContentMessage,
  CaptureModeResponse,
  ElementRectResponse,
  Theme,
} from "../../shared/messages";

export interface CaptureHooks {
  /** Esconde/mostra o overlay e o palco responsivo. */
  hideUi(hidden: boolean): void;
  isInspecting(): boolean;
  setInspecting(value: boolean): void;
  primary(): Element | null;
  label(el: Element): string;
  onAutoscrollDone(): void;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const FREEZE_CSS = `
  *, *::before, *::after {
    animation-delay: -1ms !important; animation-duration: 1ms !important; animation-iteration-count: 1 !important;
    transition: none !important; caret-color: transparent !important;
  }
`;
const BASE_CSS = `html, html * { scroll-behavior: auto !important; }`;

// ---------------------------------------------------------------------------
// Rolagem
// ---------------------------------------------------------------------------

/** O elemento rola de verdade? (testa movendo 1px e voltando) */
function scrolls(el: Element): boolean {
  if (el.scrollHeight <= el.clientHeight + 2) return false;
  const before = el.scrollTop;
  el.scrollTop = before + 1;
  const moved = el.scrollTop !== before;
  el.scrollTop = before;
  return moved;
}

/**
 * Quem rola a página: o documento ou, em apps com "app shell", o maior
 * contêiner rolável visível.
 */
export function mainScroller(): Element {
  const doc = document.scrollingElement ?? document.documentElement;
  if (scrolls(doc)) return doc;
  let best: Element | null = null;
  let bestArea = innerWidth * innerHeight * 0.25;
  for (const el of document.body?.querySelectorAll("*") ?? []) {
    if (el.scrollHeight <= el.clientHeight + 2 || el.clientHeight < 100) continue;
    const overflow = getComputedStyle(el).overflowY;
    if (!/(auto|scroll|overlay)/.test(overflow)) continue;
    const r = el.getBoundingClientRect();
    const area = Math.max(0, Math.min(r.right, innerWidth) - Math.max(r.left, 0)) * Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0));
    if (area > bestArea) {
      best = el;
      bestArea = area;
    }
  }
  return best ?? doc;
}

const maxScroll = (el: Element) => Math.max(0, el.scrollHeight - el.clientHeight);

/** Seletor estável para achar o mesmo elemento em outro documento (moldura → página). */
export function selectorOf(el: Element): string {
  const parts: string[] = [];
  let cur: Element | null = el;
  while (cur && cur !== cur.ownerDocument.documentElement) {
    if (cur.id && cur.ownerDocument.querySelectorAll(`#${CSS.escape(cur.id)}`).length === 1) {
      parts.unshift(`#${CSS.escape(cur.id)}`);
      break;
    }
    const parent: Element | null = cur.parentElement;
    if (!parent) break;
    const tag = cur.localName;
    const same = [...parent.children].filter((c) => c.localName === tag);
    parts.unshift(same.length > 1 ? `${CSS.escape(tag)}:nth-of-type(${same.indexOf(cur) + 1})` : CSS.escape(tag));
    cur = parent;
  }
  return parts.join(" > ");
}

// ---------------------------------------------------------------------------
// Auto scroll
// ---------------------------------------------------------------------------

const RAMP = 240; // px de aceleração/desaceleração

class AutoScroller {
  private raf = 0;
  private paused = false;
  private speed = 200;
  private running = false;

  start(options: AutoscrollOptions, onDone: () => void) {
    this.stop();
    this.running = true;
    this.paused = false;
    this.speed = options.speed;
    const target = mainScroller();
    let pos = target.scrollTop;
    let lastSet = pos;
    let dir: 1 | -1 = 1;
    let phase: "wait" | "move" = "wait";
    let waitUntil = performance.now() + options.startPauseMs;
    let afterWait: "move" | "turn" | "done" = "move";
    let last = performance.now();

    const finish = () => {
      this.running = false;
      onDone();
    };

    const tick = (now: number) => {
      if (!this.running) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      this.raf = requestAnimationFrame(tick);
      if (this.paused) {
        waitUntil += dt * 1000;
        return;
      }
      if (phase === "wait") {
        if (now < waitUntil) return;
        if (afterWait === "done") return finish();
        if (afterWait === "turn") dir = -1;
        phase = "move";
      }
      // o usuário rolou por conta própria: continua de onde ele parou
      if (Math.abs(target.scrollTop - lastSet) > 3) pos = target.scrollTop;
      const max = maxScroll(target);
      const distance = dir === 1 ? max - pos : pos;
      const traveled = dir === 1 ? pos : max - pos;
      const ease = options.easing
        ? 0.15 + 0.85 * Math.min(1, Math.min(distance, traveled + RAMP * 0.35) / RAMP)
        : 1;
      pos = Math.max(0, Math.min(max, pos + dir * this.speed * ease * dt));
      target.scrollTop = pos;
      lastSet = target.scrollTop;
      const arrived = dir === 1 ? pos >= max - 0.5 : pos <= 0.5;
      if (arrived) {
        phase = "wait";
        waitUntil = now + options.endPauseMs;
        afterWait = dir === 1 && options.direction === "down-up" ? "turn" : "done";
      }
    };
    this.raf = requestAnimationFrame(tick);
  }

  control(change: { paused?: boolean; speed?: number }) {
    if (change.paused !== undefined) this.paused = change.paused;
    if (change.speed) this.speed = change.speed;
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }
}

// ---------------------------------------------------------------------------

interface SavedStyle {
  el: HTMLElement;
  style: string | null;
}

export class PageCapture {
  private active = false;
  private wasInspecting = false;
  private style: HTMLStyleElement | null = null;
  private scroll: Array<{ el: Element; top: number; left: number }> = [];
  private theme: { dark: boolean; light: boolean; colorScheme: string } | null = null;
  private expanded: SavedStyle[] = [];
  private target: { el: Element; selector: string } | null = null;
  private autoscroll = new AutoScroller();

  constructor(private hooks: CaptureHooks) {}

  /** Retorna true quando responde de forma assíncrona. */
  handle(message: CaptureContentMessage, respond: (response: unknown) => void): boolean {
    switch (message.type) {
      case "capture-mode":
        respond(message.on ? this.enter(!!message.freeze, !!message.element) : this.exit());
        return false;
      case "capture-theme":
        this.setTheme(message.theme);
        respond({ ok: true });
        return false;
      case "capture-page":
        this.preparePage(message).then(respond, () => respond({ ok: false }));
        return true;
      case "capture-page-restore":
        this.restoreExpanded();
        respond({ ok: true });
        return false;
      case "capture-element":
        respond({ ok: true, rect: this.elementRect(message.padding) } satisfies ElementRectResponse);
        return false;
      case "autoscroll-start":
        this.autoscroll.start(message.options, () => this.hooks.onAutoscrollDone());
        respond({ ok: true });
        return false;
      case "autoscroll-control":
        this.autoscroll.control(message);
        respond({ ok: true });
        return false;
      case "autoscroll-stop":
        this.autoscroll.stop();
        respond({ ok: true });
        return false;
    }
  }

  private enter(freeze: boolean, element: boolean): CaptureModeResponse {
    if (!this.active) {
      this.active = true;
      this.wasInspecting = this.hooks.isInspecting();
      if (this.wasInspecting) this.hooks.setInspecting(false);
      this.hooks.hideUi(true);
      const scroller = mainScroller();
      this.scroll = [document.scrollingElement ?? document.documentElement, scroller].map((el) => ({
        el,
        top: el.scrollTop,
        left: el.scrollLeft,
      }));
      this.style = document.createElement("style");
      this.style.setAttribute("data-omnia-inspect", "capture");
      document.documentElement.append(this.style);
    }
    this.style!.textContent = BASE_CSS + (freeze ? FREEZE_CSS : "");

    this.target = null;
    if (element) {
      const el = this.hooks.primary();
      if (el) this.target = { el, selector: selectorOf(el) };
    }
    return { ok: true, element: this.target ? { label: this.hooks.label(this.target.el) } : null };
  }

  private exit() {
    if (!this.active) return { ok: true };
    this.active = false;
    this.autoscroll.stop();
    this.restoreExpanded();
    this.setTheme(null);
    this.style?.remove();
    this.style = null;
    for (const { el, top, left } of this.scroll) {
      el.scrollTop = top;
      el.scrollLeft = left;
    }
    this.scroll = [];
    this.target = null;
    this.hooks.hideUi(false);
    if (this.wasInspecting) this.hooks.setInspecting(true);
    return { ok: true };
  }

  /** Classe `.dark` + color-scheme no <html> (null = como estava). */
  private setTheme(theme: Theme | null) {
    const html = document.documentElement;
    if (!this.theme) {
      if (!theme) return;
      this.theme = {
        dark: html.classList.contains("dark"),
        light: html.classList.contains("light"),
        colorScheme: html.style.colorScheme,
      };
    }
    const original = this.theme;
    if (!theme) {
      html.classList.toggle("dark", original.dark);
      html.classList.toggle("light", original.light);
      html.style.colorScheme = original.colorScheme;
      this.theme = null;
      return;
    }
    html.classList.toggle("dark", theme === "dark");
    if (original.light || original.dark) html.classList.toggle("light", theme === "light");
    html.style.colorScheme = theme;
  }

  private async preparePage(opts: { toTop: boolean; lazy: boolean; expand: boolean }) {
    let scroller = mainScroller();
    if (opts.lazy) {
      for (const img of document.querySelectorAll<HTMLImageElement>('img[loading="lazy"]')) img.loading = "eager";
      const step = Math.max(200, scroller.clientHeight * 0.8);
      for (let i = 0; i < 80 && scroller.scrollTop < maxScroll(scroller) - 1; i++) {
        scroller.scrollTop += step;
        await sleep(90);
      }
      await sleep(150);
      scroller.scrollTop = 0;
      await Promise.race([
        Promise.all([...document.images].filter((img) => !img.complete).map((img) => img.decode().catch(() => {}))),
        sleep(2000),
      ]);
    }
    if (opts.toTop) {
      scroller.scrollTop = 0;
      (document.scrollingElement ?? document.documentElement).scrollTop = 0;
    }
    if (opts.expand) scroller = this.expand(scroller);
    return { ok: true, height: Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight ?? 0) };
  }

  /** App shell: solta a altura do contêiner rolável e dos pais para o documento crescer. */
  private expand(scroller: Element): Element {
    const doc = document.scrollingElement ?? document.documentElement;
    if (scroller === doc || !(scroller instanceof HTMLElement)) return scroller;
    const set = (el: HTMLElement, props: Record<string, string>) => {
      this.expanded.push({ el, style: el.getAttribute("style") });
      for (const [k, v] of Object.entries(props)) el.style.setProperty(k, v, "important");
    };
    set(scroller, { height: "auto", "max-height": "none", overflow: "visible" });
    for (let el = scroller.parentElement; el; el = el.parentElement) {
      set(el, { height: "auto", "max-height": "none", "min-height": "0", overflow: "visible" });
    }
    return doc;
  }

  private restoreExpanded() {
    for (const { el, style } of this.expanded.reverse()) {
      if (style === null) el.removeAttribute("style");
      else el.setAttribute("style", style);
    }
    this.expanded = [];
  }

  /** Retângulo do elemento em coordenadas do documento, com respiro. */
  private elementRect(padding: number): ElementRectResponse["rect"] {
    if (!this.target) return null;
    let el: Element | null = this.target.el;
    if (!el.isConnected || el.ownerDocument !== document) {
      try {
        el = document.querySelector(this.target.selector);
      } catch {
        el = null;
      }
    }
    if (!el) return null;
    el.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" as ScrollBehavior });
    const r = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    if (r.width < 1 || r.height < 1 || style.visibility === "hidden" || style.display === "none") return null;
    const x = Math.max(0, r.left + scrollX - padding);
    const y = Math.max(0, r.top + scrollY - padding);
    return {
      x,
      y,
      width: Math.ceil(r.right + scrollX + padding - x),
      height: Math.ceil(r.bottom + scrollY + padding - y),
    };
  }
}
