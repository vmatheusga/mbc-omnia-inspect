import type { StageMode, StageState, ViewportSpec } from "../../shared/messages";
import { frameDocument } from "./frames";

const TOOLBAR = 44;
const GAP = 32;
const PAD = 24;
const LABEL = 28;

const STYLE = `
  :host { all: initial; }
  .stage {
    position: fixed; inset: 0; z-index: 2147483646; display: flex; flex-direction: column;
    background: #1b1d1f; color: #ecedee; overflow: hidden;
    font: 400 12px/1.4 Inter, ui-sans-serif, system-ui, -apple-system, sans-serif;
  }
  .toolbar {
    height: ${TOOLBAR}px; flex: none; display: flex; align-items: center; gap: 10px; padding: 0 12px 0 16px;
    border-bottom: 1px solid #2b2f31; background: #151718;
  }
  .title { font-weight: 600; white-space: nowrap; }
  .summary { color: #9ba1a6; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; min-width: 0; }
  .spacer { flex: 1; }
  button, select, label.toggle {
    font: inherit; color: #ecedee; background: #202425; border: 1px solid #313538; border-radius: 6px;
    height: 28px; padding: 0 10px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;
    white-space: nowrap; flex: none;
  }
  button:hover, select:hover, label.toggle:hover { background: #2b2f31; }
  label.toggle input { margin: 0; accent-color: #0d99ff; }
  .close { padding: 0 8px; font-size: 16px; line-height: 1; }
  .canvas { flex: 1; overflow: auto; }
  .row { display: flex; align-items: flex-start; gap: ${GAP}px; padding: ${PAD}px; width: max-content; min-width: 100%; box-sizing: border-box; }
  .row.center { justify-content: center; }
  .device { flex: none; display: flex; flex-direction: column; gap: 8px; }
  .label { height: ${LABEL - 8}px; display: flex; align-items: baseline; gap: 8px; white-space: nowrap; }
  .label b { font-weight: 600; }
  .label span { color: #9ba1a6; font-variant-numeric: tabular-nums; }
  .label em { font-style: normal; color: #0d99ff; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  .frame-box { position: relative; overflow: hidden; background: #fff; border-radius: 10px; box-shadow: 0 0 0 1px #313538, 0 12px 32px rgb(0 0 0 / 0.35); }
  iframe { position: absolute; top: 0; left: 0; border: 0; transform-origin: 0 0; background: #fff; }
  .error { position: absolute; inset: 0; display: none; align-items: center; justify-content: center; text-align: center; padding: 24px; color: #11181c; background: #f8f9fa; font-size: 13px; }
`;

function breakpointOf(width: number) {
  const bps: Array<[string, number]> = [["2xl", 1536], ["xl", 1280], ["lg", 1024], ["md", 768], ["sm", 640]];
  return bps.find(([, min]) => width >= min)?.[0] ?? "base";
}

export interface StageOptions {
  /** URL carregada nas molduras (padrão: a página atual). */
  frameUrl?: () => string;
  /** Libera o carregamento em iframe (remove X-Frame-Options/CSP desta aba). */
  allowFrames?: () => Promise<void>;
  onChange?: (state: StageState | null) => void;
  /** Área ocupada pelo palco (padrão: a janela inteira). */
  bounds?: () => DOMRect | null;
  /** Chamado quando uma moldura carrega ou rola (para redesenhar o overlay). */
  onFrameActivity?: () => void;
  /** Botão "Capturar" da barra: prints dos tamanhos abertos. */
  onCapture?: (devices: ViewportSpec[]) => void;
}

export class ResponsiveStage {
  private host: HTMLElement | null = null;
  private root: ShadowRoot | null = null;
  private canvas!: HTMLElement;
  private summary!: HTMLElement;
  private frames: HTMLIFrameElement[] = [];
  private state: StageState | null = null;
  /** Rolagem independente por padrão; sincronizar é opcional. */
  private syncScroll = false;
  private syncNavigation = true;
  /** Molduras roladas por nós: ignoram os próprios eventos por um instante (evita "ping-pong"). */
  private suppressUntil = new WeakMap<HTMLIFrameElement, number>();
  private previousOverflow = "";
  private suspended = false;

  constructor(private options: StageOptions) {}

  get current() {
    return this.state;
  }

  isStage(el: Element | null) {
    return !!el && el === this.host;
  }

  /** Área das molduras (abaixo da barra): é a única parte em que a inspeção age. */
  canvasBounds(): DOMRect | null {
    return this.canvas && !this.suspended && this.host ? this.canvas.getBoundingClientRect() : null;
  }

  /** Elemento sob o ponto dentro do palco (moldura) — ignora a barra. */
  elementAt(x: number, y: number): Element | null {
    const hits = this.root?.elementsFromPoint(x, y) ?? [];
    return hits.find((el): el is HTMLIFrameElement => el instanceof HTMLIFrameElement) ?? null;
  }

  async show(devices: ViewportSpec[], mode: StageMode) {
    if (!devices.length) return this.hide();
    await this.options.allowFrames?.().catch(() => {});
    if (!this.host) this.mount();
    this.state = { mode, devices, zoom: this.state?.zoom ?? "fit", syncScroll: this.syncScroll };
    this.render();
    this.options.onChange?.(this.state);
  }

  hide() {
    if (!this.host) return;
    this.host.remove();
    this.host = null;
    this.root = null;
    this.frames = [];
    this.state = null;
    this.suspended = false;
    document.documentElement.style.overflow = this.previousOverflow;
    window.removeEventListener("resize", this.onResize);
    this.options.onChange?.(null);
  }

  /** Esconde o palco sem descarregar as molduras (prints e gravações da página). */
  suspend() {
    if (!this.host || this.suspended) return;
    this.suspended = true;
    this.host.style.display = "none";
    document.documentElement.style.overflow = this.previousOverflow;
  }

  resume() {
    if (!this.host || !this.suspended) return;
    this.suspended = false;
    this.host.style.display = "";
    document.documentElement.style.overflow = "hidden";
    this.layout();
  }

  private onResize = () => this.layout();

  private mount() {
    this.host = document.createElement("omnia-inspect-stage");
    this.root = this.host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = STYLE;
    const stage = document.createElement("div");
    stage.className = "stage";

    const toolbar = document.createElement("div");
    toolbar.className = "toolbar";
    const title = document.createElement("span");
    title.className = "title";
    title.textContent = "Responsivo";
    this.summary = document.createElement("span");
    this.summary.className = "summary";

    const zoom = document.createElement("select");
    zoom.title = "Zoom";
    for (const [value, label] of [["fit", "Ajustar"], ["0.5", "50%"], ["0.75", "75%"], ["1", "100%"]]) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      zoom.append(option);
    }
    zoom.addEventListener("change", () => {
      if (!this.state) return;
      this.state = { ...this.state, zoom: zoom.value === "fit" ? "fit" : Number(zoom.value) };
      this.layout();
      this.options.onChange?.(this.state);
    });

    const toggle = (label: string, title: string, checked: boolean, onChange: (value: boolean) => void) => {
      const el = document.createElement("label");
      el.className = "toggle";
      el.title = title;
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = checked;
      input.addEventListener("change", () => onChange(input.checked));
      el.append(input, document.createTextNode(label));
      return el;
    };
    const syncScroll = toggle("Rolar juntos", "Rolar uma moldura rola as outras na mesma proporção", this.syncScroll, (value) => {
      this.syncScroll = value;
      if (this.state) this.state = { ...this.state, syncScroll: value };
    });
    const syncNav = toggle("Navegar juntos", "Abrir um link numa moldura abre nas outras", this.syncNavigation, (value) => {
      this.syncNavigation = value;
    });

    const reload = document.createElement("button");
    reload.textContent = "↻ Recarregar";
    reload.addEventListener("click", () => this.frames.forEach((f) => f.contentWindow?.location.reload()));

    const capture = document.createElement("button");
    capture.textContent = "📷 Capturar";
    capture.title = "Tirar print destes tamanhos (abre a aba Capturar no painel)";
    capture.addEventListener("click", () => {
      if (this.state) this.options.onCapture?.(this.state.devices);
    });

    const close = document.createElement("button");
    close.className = "close";
    close.title = "Fechar visualização responsiva";
    close.textContent = "×";
    close.addEventListener("click", () => this.hide());

    toolbar.append(title, this.summary, zoom, syncScroll, syncNav, reload);
    if (this.options.onCapture) toolbar.append(capture);
    toolbar.append(close);
    this.canvas = document.createElement("div");
    this.canvas.className = "canvas";
    stage.append(toolbar, this.canvas);
    this.root.append(style, stage);
    document.documentElement.append(this.host);

    // A página de trás não rola enquanto o palco está aberto
    this.previousOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    window.addEventListener("resize", this.onResize);
  }

  private render() {
    if (!this.state || !this.root) return;
    const url = this.options.frameUrl?.() ?? location.href;
    const row = document.createElement("div");
    row.className = `row${this.state.mode === "single" ? " center" : ""}`;
    this.frames = [];

    for (const spec of this.state.devices) {
      const device = document.createElement("div");
      device.className = "device";
      device.dataset.width = String(spec.width);
      device.dataset.height = String(spec.height ?? 0);

      const label = document.createElement("div");
      label.className = "label";
      const name = document.createElement("b");
      name.textContent = spec.label;
      const dims = document.createElement("span");
      const bp = document.createElement("em");
      bp.textContent = breakpointOf(spec.width);
      label.append(name, dims, bp);

      const box = document.createElement("div");
      box.className = "frame-box";
      const iframe = document.createElement("iframe");
      iframe.title = `${spec.label} ${spec.width}px`;
      iframe.setAttribute("name", `omnia-inspect-${spec.id}`);
      iframe.src = url;
      const error = document.createElement("div");
      error.className = "error";
      error.textContent = "Esta página não permite ser exibida em moldura. Use a emulação nativa no painel (Avançado).";
      iframe.addEventListener("load", () => {
        const ok = !!frameDocument(iframe);
        error.style.display = ok ? "none" : "flex";
        if (ok) {
          const first = iframe.dataset.loaded !== "1";
          iframe.dataset.loaded = "1";
          this.wireFrame(iframe, first);
        }
        this.options.onFrameActivity?.();
      });
      box.append(iframe, error);
      device.append(label, box);
      row.append(device);
      this.frames.push(iframe);
    }
    this.canvas.replaceChildren(row);
    this.layout();
  }

  /** Calcula a escala e aplica tamanhos (sem recarregar os iframes). */
  private layout() {
    if (!this.state || !this.root) return;
    const bounds = this.options.bounds?.() ?? new DOMRect(0, 0, window.innerWidth, window.innerHeight);
    const stageEl = this.root.querySelector<HTMLElement>(".stage")!;
    Object.assign(stageEl.style, {
      inset: "auto",
      top: `${bounds.top}px`,
      left: `${bounds.left}px`,
      width: `${bounds.width}px`,
      height: `${bounds.height}px`,
    });
    const available = {
      width: bounds.width - PAD * 2,
      height: bounds.height - TOOLBAR - PAD * 2 - LABEL,
    };
    const specs = this.state.devices.map((d) => ({ ...d, height: d.height ?? Math.max(available.height, 600) }));
    let scale: number;
    if (this.state.zoom !== "fit") scale = this.state.zoom;
    else if (this.state.mode === "single") {
      const d = specs[0];
      scale = Math.min(1, available.width / d.width, available.height / d.height);
    } else {
      const maxH = Math.max(...specs.map((d) => d.height));
      scale = Math.min(1, available.height / maxH);
    }
    scale = Math.max(0.1, scale);

    const devices = [...this.canvas.querySelectorAll<HTMLElement>(".device")];
    devices.forEach((device, i) => {
      const spec = specs[i];
      const box = device.querySelector<HTMLElement>(".frame-box")!;
      const iframe = device.querySelector("iframe")!;
      box.style.width = `${spec.width * scale}px`;
      box.style.height = `${spec.height * scale}px`;
      iframe.style.width = `${spec.width}px`;
      iframe.style.height = `${spec.height}px`;
      iframe.style.transform = `scale(${scale})`;
      device.querySelector(".label span")!.textContent =
        `${spec.width} × ${spec.height}${scale < 1 ? ` · ${Math.round(scale * 100)}%` : ""}`;
    });
    const names = this.state.devices.map((d) => `${d.label} ${d.width}`).join(" · ");
    this.summary.textContent = names;
    this.options.onFrameActivity?.();
  }

  /** Rolagem e navegação sincronizadas entre as molduras. */
  private wireFrame(iframe: HTMLIFrameElement, firstLoad: boolean) {
    const win = iframe.contentWindow;
    if (!win) return;
    win.addEventListener(
      "scroll",
      () => {
        this.options.onFrameActivity?.();
        if (!this.syncScroll) return;
        // rolagem que nós mesmos aplicamos: não reenvia
        if ((this.suppressUntil.get(iframe) ?? 0) > performance.now()) return;
        const doc = win.document.documentElement;
        const ratio = doc.scrollHeight > win.innerHeight ? win.scrollY / (doc.scrollHeight - win.innerHeight) : 0;
        for (const other of this.frames) {
          if (other === iframe) continue;
          const ow = other.contentWindow;
          const od = frameDocument(other)?.documentElement;
          if (!ow || !od) continue;
          this.suppressUntil.set(other, performance.now() + 200);
          // "instant" ignora o scroll-behavior: smooth do site (a causa do vai-e-volta)
          ow.scrollTo({ top: ratio * (od.scrollHeight - ow.innerHeight), behavior: "instant" as ScrollBehavior });
        }
      },
      { passive: true },
    );
    // navegação: quando uma moldura muda de página, as outras acompanham
    if (firstLoad) return;
    const href = win.location.href;
    for (const other of this.frames) {
      if (other === iframe || !this.syncNavigation || other.dataset.loaded !== "1") continue;
      try {
        if (other.contentWindow && other.contentWindow.location.href !== href && other.dataset.loading !== href) {
          other.dataset.loading = href;
          other.contentWindow.location.href = href;
        }
      } catch {
        /* moldura sem acesso */
      }
    }
    iframe.dataset.loading = "";
  }

  scrollBy(x: number, y: number) {
    this.canvas?.scrollBy(x, y);
  }

  /** Lista de molduras (para o picker e para redesenho). */
  get frameElements() {
    return this.frames;
  }
}

export type { StageMode, StageState };
