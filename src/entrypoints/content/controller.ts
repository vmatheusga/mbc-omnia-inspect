import { pascal } from "../../engine/knowledge";
import type {
  AssetsResponse,
  ContentMessage,
  FetchAssetResponse,
  PanelMessage,
  PingResponse,
} from "../../shared/messages";
import { collectAssets, fetchAsDataUrl } from "./assets";
import { PageCapture } from "./capture";
import { buildInput, elementById, idOf } from "./collect";
import { deepestAt, descendIntoFramesAt, rectOf } from "./frames";
import { measure } from "./measure";
import { Overlay } from "./overlay";
import { ResponsiveStage } from "./stage";
import { descendToward, normalizeTarget, resolveTarget } from "./targeting";

/** Canal entre o controller (página) e o painel — chrome.runtime ou em memória. */
export interface ContentTransport {
  send(message: ContentMessage): void;
  /** O handler retorna `true` quando vai responder de forma assíncrona. */
  onMessage(handler: (message: PanelMessage, respond: (response: unknown) => void) => boolean | void): void;
  /** Libera iframes desta página (remove X-Frame-Options/CSP) para o palco responsivo. */
  allowFrames?(): Promise<void>;
}

function quickLabel(el: Element): string {
  const slot = el.getAttribute("data-slot");
  if (slot) return pascal(slot);
  const icon = (el.getAttribute("class") ?? "").match(/lucide-([a-z0-9-]+)/)?.[1];
  if (icon) return `Ícone ${pascal(icon)}`;
  const id = el.id ? `#${el.id}` : "";
  return `${el.tagName.toLowerCase()}${id}`;
}

export interface ControllerOptions {
  /** Elementos que o seletor deve ignorar (ex.: o painel no playground). */
  ignore?: (el: Element) => boolean;
  /** Área coberta pela película de inspeção (padrão: viewport inteira). */
  shieldBounds?: () => DOMRect | null;
  /** URL das molduras do palco responsivo (padrão: a própria página). */
  frameUrl?: () => string;
}

const MAX_SELECTION = 12;
type Direction = "parent" | "child" | "prev" | "next";

function neighbor(el: Element, direction: Direction): Element | null {
  const next =
    direction === "parent"
      ? el.parentElement
      : direction === "child"
        ? el.firstElementChild
        : direction === "prev"
          ? el.previousElementSibling
          : el.nextElementSibling;
  if (!next || next === next.ownerDocument.documentElement) return null;
  return normalizeTarget(next);
}

export function startController(transport: ContentTransport, options: ControllerOptions = {}) {
  // A barra do palco (zoom, recarregar, capturar, fechar) nunca é alvo da inspeção
  const ignored = (target: EventTarget | null) =>
    target instanceof Element && (stage.isStage(target) || !!options.ignore?.(target));
  let overlay: Overlay | null = null;
  let inspecting = false;

  // Seleção (estilo Figma): vários elementos, um primário
  let selection: Element[] = [];
  let primary: Element | null = null;
  const labels = new WeakMap<Element, string>();

  // Hover: a camada exata sob o mouse e o alvo resolvido (componente ou exato)
  let exactHover: Element | null = null;
  let hovered: Element | null = null;
  let deepKey = false; // Ctrl/⌘: camada exata
  let altKey = false; // Alt/Option: medir distâncias
  let highlighted: Element | null = null;
  let frame = 0;
  let sendSeq = 0;
  let lastPoint: { x: number; y: number } | null = null;

  const ensureOverlay = () => (overlay ??= new Overlay());
  /** Película da inspeção: com o palco aberto, deixa a barra dele clicável. */
  const shieldRect = () => stage.canvasBounds() ?? options.shieldBounds?.() ?? null;
  const send = (message: ContentMessage) => transport.send(message);
  const sendState = () => send({ type: "state", inspecting, hasSelection: selection.length > 0 });

  const stage = new ResponsiveStage({
    frameUrl: options.frameUrl,
    bounds: options.shieldBounds,
    allowFrames: transport.allowFrames?.bind(transport),
    onChange: (state) => {
      send({ type: "stage-state", state });
      if (inspecting) overlay?.setShield(true, shieldRect());
      if (!state && selection.some((el) => el.ownerDocument !== document)) {
        setSelection(selection.filter((el) => el.ownerDocument === document));
      }
      redraw();
    },
    onFrameActivity: () => redraw(),
    onCapture: (devices) => send({ type: "stage-capture", devices }),
  });

  // Prints e gravações: página limpa (sem overlay/palco) e auto scroll
  const capture = new PageCapture({
    hideUi: (hidden) => {
      overlay?.setHidden(hidden);
      if (hidden) stage.suspend();
      else stage.resume();
    },
    isInspecting: () => inspecting,
    setInspecting: (value) => setInspecting(value),
    primary: () => primary,
    label: (el) => labels.get(el) ?? quickLabel(el),
    onAutoscrollDone: () => send({ type: "autoscroll-done" }),
  });

  /**
   * Camada exata sob o ponto, atravessando o palco e as molduras.
   * `deep`: continua descendo pela geometria (alcança ícones com pointer-events: none).
   */
  const pick = (x: number, y: number, deep = false): Element | null => {
    let el = overlay?.elementAt(x, y) ?? null;
    if (stage.isStage(el)) el = stage.elementAt(x, y);
    const hit = descendIntoFramesAt(el, x, y);
    if (!hit.el) return null;
    return normalizeTarget(deep ? deepestAt(hit.el, hit.x, hit.y) : hit.el);
  };

  const resolveHover = () => {
    hovered = exactHover && !ignored(exactHover) ? resolveTarget(exactHover, { deep: deepKey }) : null;
  };

  const redraw = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      if (!overlay) return;
      const connected = selection.filter((el) => el.isConnected);
      if (connected.length !== selection.length) {
        selection = connected;
        if (primary && !primary.isConnected) primary = selection[selection.length - 1] ?? null;
        if (!selection.length) send({ type: "selection-lost" });
      }
      overlay.showSelections(
        selection.map((el) => ({ el, label: labels.get(el) ?? quickLabel(el), primary: el === primary })),
      );
      if (inspecting && hovered && !selection.includes(hovered)) {
        overlay.showHover(hovered, quickLabel(hovered), { discreet: selection.length > 0 });
      } else overlay.hideHover();
      if (inspecting && altKey && primary && hovered && hovered !== primary) {
        overlay.showMeasure(measure(rectOf(primary), rectOf(hovered)));
      } else overlay.hideMeasure();
      overlay.showHighlight(highlighted);
    });
  };

  /** Analisa todos os selecionados e envia ao painel. */
  const sendSelection = async () => {
    const seq = ++sendSeq;
    const items = [...selection];
    const inputs = await Promise.all(items.map((el) => buildInput(el)));
    if (seq !== sendSeq) return; // seleção mudou enquanto coletava
    send({ type: "selection", inputs, primaryId: primary ? idOf(primary) : null });
    sendState();
  };

  const setSelection = (list: Element[], nextPrimary?: Element | null) => {
    selection = [...new Set(list)].slice(-MAX_SELECTION);
    primary = nextPrimary !== undefined ? nextPrimary : (selection[selection.length - 1] ?? null);
    if (primary && !selection.includes(primary)) primary = selection[selection.length - 1] ?? null;
    ensureOverlay().bringToFront();
    redraw();
    void sendSelection();
  };

  const toggleInSelection = (el: Element) => {
    if (selection.includes(el)) {
      const rest = selection.filter((s) => s !== el);
      setSelection(rest, primary === el ? (rest[rest.length - 1] ?? null) : primary);
    } else setSelection([...selection, el], el);
  };

  const setInspecting = (value: boolean) => {
    if (inspecting === value) return;
    inspecting = value;
    if (value) {
      ensureOverlay().bringToFront();
      overlay!.setShield(true, shieldRect());
      window.addEventListener("pointermove", onMove, true);
      for (const type of BLOCKED) window.addEventListener(type, onBlock, true);
      window.addEventListener("click", onClick, true);
      window.addEventListener("dblclick", onDblClick, true);
      window.addEventListener("wheel", onWheel, { capture: true, passive: false });
    } else {
      exactHover = null;
      hovered = null;
      altKey = false;
      overlay?.hideHover();
      overlay?.hideMeasure();
      overlay?.setShield(false);
      window.removeEventListener("pointermove", onMove, true);
      for (const type of BLOCKED) window.removeEventListener(type, onBlock, true);
      window.removeEventListener("click", onClick, true);
      window.removeEventListener("dblclick", onDblClick, true);
      window.removeEventListener("wheel", onWheel, true);
    }
    redraw();
    sendState();
  };

  const clear = () => {
    setInspecting(false);
    stage.hide();
    selection = [];
    primary = null;
    highlighted = null;
    sendSeq++;
    overlay?.destroy();
    overlay = null;
    sendState();
  };

  // --- Eventos da página -----------------------------------------------------
  const BLOCKED = ["pointerdown", "pointerup", "mousedown", "mouseup", "contextmenu"] as const;

  function onMove(e: PointerEvent) {
    deepKey = e.ctrlKey || e.metaKey;
    altKey = e.altKey;
    lastPoint = { x: e.clientX, y: e.clientY };
    const exact = pick(e.clientX, e.clientY, deepKey);
    if (ignored(exact)) {
      exactHover = null;
      hovered = null;
      overlay?.hideHover();
      overlay?.hideMeasure();
      return;
    }
    exactHover = exact;
    resolveHover();
    redraw();
  }

  /** A película recebe o scroll: repassa ao contêiner rolável sob o cursor. */
  function onWheel(e: WheelEvent) {
    if (!overlay || !(e.target instanceof Element) || !overlay.isOverlay(e.target)) return;
    e.preventDefault();
    let el: Element | null = pick(e.clientX, e.clientY);
    if (!el || stage.isStage(overlay.elementAt(e.clientX, e.clientY))) {
      // palco: rolagem horizontal/fora das molduras move a tela de molduras
      if (!el || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        stage.scrollBy(e.deltaX, el ? 0 : e.deltaY);
        if (!el) return;
      }
    }
    while (el && el !== el.ownerDocument.documentElement) {
      const style = getComputedStyle(el);
      const canY = /(auto|scroll|overlay)/.test(style.overflowY) && el.scrollHeight > el.clientHeight;
      const canX = /(auto|scroll|overlay)/.test(style.overflowX) && el.scrollWidth > el.clientWidth;
      if ((canY && e.deltaY) || (canX && e.deltaX)) {
        el.scrollBy(e.deltaX, e.deltaY);
        return;
      }
      el = el.parentElement;
    }
    (el?.ownerDocument.defaultView ?? window).scrollBy(e.deltaX, e.deltaY);
  }

  function onBlock(e: Event) {
    if (ignored(e.target)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
  }

  function onClick(e: MouseEvent) {
    if (ignored(e.target)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    // segundo clique de um duplo clique: quem decide é o dblclick
    if (e.detail > 1) return;
    const deep = e.ctrlKey || e.metaKey;
    const exact = pick(e.clientX, e.clientY, deep) ?? exactHover;
    if (!exact || ignored(exact)) return;
    const target = resolveTarget(exact, { deep });
    if (!target) return;
    if (e.shiftKey) toggleInSelection(target);
    else setSelection([target]);
  }

  /** Duplo clique: desce um nível dentro do selecionado (como no Figma). */
  function onDblClick(e: MouseEvent) {
    if (ignored(e.target)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const exact = pick(e.clientX, e.clientY, true);
    if (!primary || !exact) return;
    const next = descendToward(primary, exact);
    if (next) setSelection([next]);
  }

  const navigate = (direction: Direction) => {
    if (!primary) return;
    const next = neighbor(primary, direction);
    if (next) setSelection([next]);
  };

  const updateModifiers = (e: KeyboardEvent) => {
    const deep = e.ctrlKey || e.metaKey;
    if (deep !== deepKey || e.altKey !== altKey) {
      deepKey = deep;
      altKey = e.altKey;
      if (lastPoint) {
        const exact = pick(lastPoint.x, lastPoint.y, deepKey);
        if (!ignored(exact)) exactHover = exact;
      }
      resolveHover();
      redraw();
    }
  };

  window.addEventListener(
    "keydown",
    (e) => {
      if (inspecting) {
        updateModifiers(e);
        // Alt sozinho abre o menu da janela no Windows
        if (e.key === "Alt") e.preventDefault();
      }
      if (!inspecting && !selection.length && !stage.current) return;
      if (ignored(e.target)) return;
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (inspecting) setInspecting(false);
        else if (selection.length) setSelection([]);
        else stage.hide();
        return;
      }
      if (!inspecting) return;
      const map: Record<string, Direction> = {
        ArrowUp: "parent",
        ArrowDown: "child",
        ArrowLeft: "prev",
        ArrowRight: "next",
      };
      const direction = map[e.key];
      if (direction) {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (primary) navigate(direction);
        else if (hovered) {
          hovered = neighbor(hovered, direction) ?? hovered;
          redraw();
        }
      } else if (e.key === "Enter" && hovered) {
        e.preventDefault();
        setSelection(e.shiftKey ? [...selection, hovered] : [hovered], hovered);
      }
    },
    true,
  );
  window.addEventListener("keyup", (e) => inspecting && updateModifiers(e), true);
  window.addEventListener("blur", () => {
    if (deepKey || altKey) {
      deepKey = false;
      altKey = false;
      resolveHover();
      redraw();
    }
  });

  window.addEventListener("scroll", redraw, { capture: true, passive: true });
  window.addEventListener(
    "resize",
    () => {
      if (inspecting) overlay?.setShield(true, shieldRect());
      redraw();
    },
    { passive: true },
  );

  // --- Mensagens do painel ----------------------------------------------------
  transport.onMessage((message, sendResponse) => {
    switch (message.type) {
      case "ping": {
        const response: PingResponse = { ok: true, inspecting, hasSelection: selection.length > 0 };
        sendResponse(response);
        return;
      }
      case "set-inspecting":
        setInspecting(message.value);
        break;
      case "toggle-inspecting":
        setInspecting(!inspecting);
        break;
      case "select": {
        const el = elementById(message.id);
        if (el) {
          el.scrollIntoView({ block: "nearest", inline: "nearest" });
          setSelection([el]);
        }
        break;
      }
      case "deselect": {
        const el = elementById(message.id);
        if (el) {
          const rest = selection.filter((s) => s !== el);
          setSelection(rest, primary === el ? (rest[rest.length - 1] ?? null) : primary);
        }
        break;
      }
      case "set-primary": {
        const el = elementById(message.id);
        if (el && selection.includes(el)) {
          primary = el;
          redraw();
        }
        break;
      }
      case "navigate":
        navigate(message.direction);
        break;
      case "highlight":
        highlighted = message.id ? (elementById(message.id) ?? null) : null;
        ensureOverlay();
        redraw();
        break;
      case "refresh":
        if (selection.length) void sendSelection();
        break;
      case "labels":
        for (const item of message.items) {
          const el = elementById(item.id);
          if (el) labels.set(el, item.text);
        }
        redraw();
        break;
      case "clear":
        clear();
        break;
      case "collect-assets": {
        const response: AssetsResponse = {
          ok: true,
          assets: collectAssets(options.ignore),
          url: location.href,
          title: document.title,
        };
        sendResponse(response);
        return;
      }
      case "reveal": {
        const el = elementById(message.id);
        if (el) {
          el.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
          highlighted = el;
          ensureOverlay();
          setTimeout(redraw, 350);
          setTimeout(() => {
            if (highlighted === el) {
              highlighted = null;
              redraw();
            }
          }, 1800);
        }
        break;
      }
      case "stage-show":
        stage.show(message.devices, message.mode).then(() => {
          overlay?.bringToFront();
          sendResponse({ ok: true, state: stage.current });
        });
        return true;
      case "stage-hide":
        stage.hide();
        break;
      case "stage-get":
        sendResponse({ ok: true, state: stage.current });
        return;
      case "capture-mode":
      case "capture-theme":
      case "capture-page":
      case "capture-page-restore":
      case "capture-element":
      case "autoscroll-start":
      case "autoscroll-control":
      case "autoscroll-stop":
        return capture.handle(message, sendResponse);
      case "fetch-asset":
        fetchAsDataUrl(message.url)
          .then((dataUrl) => sendResponse({ ok: true, dataUrl } satisfies FetchAssetResponse))
          .catch((error: unknown) => sendResponse({ ok: false, error: String(error) } satisfies FetchAssetResponse));
        return true;
    }
    sendResponse({ ok: true });
  });
}
