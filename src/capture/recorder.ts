/**
 * Gravação de vídeo de uma aba num tamanho emulado. Os quadros JPEG (no tamanho
 * exato do dispositivo) são repassados por uma Port ao documento offscreen, onde
 * viram MP4/WebM via WebCodecs.
 */
import type { AppliedViewport, CaptureModeResponse, RecordOptions, RecordingState } from "../shared/messages";
import type { OffscreenCommand, OffscreenRequest, OffscreenResponse } from "../shared/offscreen";
import {
  applyMetrics,
  emulateTheme,
  ensureContent,
  friendlyError,
  hideScrollbars,
  restoreMetrics,
  send,
  sessions,
  sleep,
  toContent,
} from "./cdp";

const COUNTDOWN_MS = 3000;

interface Recording {
  tabId: number;
  options: RecordOptions;
  previous: AppliedViewport | null;
  url: string;
  title: string;
  /** Interrompido antes de começar (Parar durante a contagem). */
  aborted: boolean;
  lastFrameT: number;
  frames: number;
  /** O laço de captura roda enquanto for true. */
  capturing: boolean;
  timers: ReturnType<typeof setTimeout>[];
}

let state: RecordingState = { status: "idle", pausedMs: 0 };
let rec: Recording | null = null;

export const recordingState = () => state;

function setState(next: Partial<RecordingState>) {
  state = { ...state, ...next };
  chrome.runtime.sendMessage({ type: "record-state", state }).catch(() => {});
}

async function badge(text: string) {
  await chrome.action.setBadgeBackgroundColor({ color: "#e5484d" }).catch(() => {});
  await chrome.action.setBadgeText({ text }).catch(() => {});
}

// ---------------------------------------------------------------------------
// Documento offscreen (codificador)
// ---------------------------------------------------------------------------

let port: chrome.runtime.Port | null = null;
let portWaiters: Array<(p: chrome.runtime.Port) => void> = [];
const pending = new Map<string, (res: OffscreenResponse) => void>();

/** Chamado pelo onConnect do background. */
export function connectOffscreen(p: chrome.runtime.Port) {
  port = p;
  p.onMessage.addListener((res: OffscreenResponse) => {
    pending.get(res.requestId)?.(res);
    pending.delete(res.requestId);
  });
  p.onDisconnect.addListener(() => {
    if (port === p) port = null;
  });
  portWaiters.forEach((resolve) => resolve(p));
  portWaiters = [];
}

async function ensureOffscreen(): Promise<chrome.runtime.Port> {
  if (port) return port;
  const existing = await chrome.runtime.getContexts({ contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT] });
  if (existing.length) await chrome.offscreen.closeDocument().catch(() => {});
  const connected = new Promise<chrome.runtime.Port>((resolve) => portWaiters.push(resolve));
  await chrome.offscreen.createDocument({
    url: "offscreen.html",
    reasons: [chrome.offscreen.Reason.BLOBS],
    justification: "Codificar a gravação da aba em vídeo (MP4/WebM).",
  });
  return connected;
}

function request(message: OffscreenCommand, timeout = 60_000): Promise<OffscreenResponse> {
  const requestId = Math.random().toString(36).slice(2);
  return new Promise((resolve, reject) => {
    if (!port) return reject(new Error("Codificador de vídeo indisponível."));
    const timer = setTimeout(() => {
      pending.delete(requestId);
      reject(new Error("O codificador de vídeo não respondeu."));
    }, timeout);
    pending.set(requestId, (res) => {
      clearTimeout(timer);
      resolve(res);
    });
    port.postMessage({ ...message, requestId } as OffscreenRequest);
  });
}

async function closeOffscreen() {
  port?.disconnect();
  port = null;
  await chrome.offscreen.closeDocument().catch(() => {});
}

// ---------------------------------------------------------------------------

const elapsed = (now = Date.now()) =>
  state.startedAt ? now - state.startedAt - state.pausedMs - (state.pausedAt ? now - state.pausedAt : 0) : 0;

/**
 * Captura em laço: o screencast do CDP entrega a superfície real da aba (não o
 * tamanho emulado), então cada quadro vem de Page.captureScreenshot, que respeita
 * a emulação. O carimbo de tempo é real; o codificador cuida de quadros com
 * intervalo variável.
 */
async function captureLoop(current: Recording) {
  const interval = 1000 / current.options.fps;
  while (rec === current && current.capturing) {
    if (state.status !== "recording" || !port) {
      await sleep(40);
      continue;
    }
    const started = performance.now();
    try {
      const shot = await send<{ data: string }>(current.tabId, "Page.captureScreenshot", {
        format: "jpeg",
        quality: 85,
        optimizeForSpeed: true,
      });
      if (!current.capturing || state.status !== "recording" || !port) continue;
      const t = Math.max(0, elapsed() / 1000 - (performance.now() - started) / 2000);
      if (t > current.lastFrameT || current.frames === 0) {
        current.lastFrameT = t;
        current.frames++;
        port.postMessage({ type: "frame", requestId: "", data: shot.data, t } satisfies OffscreenRequest);
      }
    } catch {
      if (rec !== current) return;
      await sleep(100);
    }
    const spent = performance.now() - started;
    if (spent < interval) await sleep(interval - spent);
  }
}

export async function startRecording(tabId: number, options: RecordOptions): Promise<RecordingState> {
  if (rec) throw new Error("Já existe uma gravação em andamento.");
  const tab = await chrome.tabs.get(tabId);
  rec = {
    tabId,
    options,
    previous: sessions.get(tabId)?.applied ?? null,
    url: tab.url ?? "",
    title: tab.title ?? "",
    aborted: false,
    lastFrameT: 0,
    frames: 0,
    capturing: false,
    timers: [],
  };
  const current = rec;
  setState({
    status: "preparing",
    tabId,
    size: options.size,
    pausedMs: 0,
    pausedAt: undefined,
    startedAt: undefined,
    countdownEndsAt: undefined,
    maxMs: options.maxMs,
    autoscroll: !!options.autoscroll,
    error: undefined,
    sessionId: undefined,
  });
  try {
    await ensureContent(tabId);
    await toContent<CaptureModeResponse>(tabId, { type: "capture-mode", on: true, freeze: false });
    await applyMetrics(tabId, options.size, { fit: true });
    if (options.theme !== "current") {
      await emulateTheme(tabId, options.theme);
      if (options.forceDarkClass) await toContent(tabId, { type: "capture-theme", theme: options.theme });
    }
    if (options.hideScrollbars) await hideScrollbars(tabId, true);
    if (options.toTop || options.lazy) {
      await toContent(tabId, { type: "capture-page", toTop: options.toTop, lazy: options.lazy, expand: false });
    }
    await ensureOffscreen();
    const ready = await request({ type: "start", format: options.format, fps: options.fps });
    if (!ready.ok) throw new Error(ready.error);

    if (options.countdown) {
      setState({ status: "countdown", countdownEndsAt: Date.now() + COUNTDOWN_MS });
      for (let i = 3; i > 0; i--) {
        if (current.aborted) break;
        await badge(String(i));
        await sleep(1000);
      }
    }
    if (current.aborted) {
      await cleanup(current);
      setState({ status: "idle" });
      return state;
    }

    setState({ status: "recording", startedAt: Date.now(), countdownEndsAt: undefined });
    await badge("REC");
    current.capturing = true;
    void captureLoop(current);
    if (options.autoscroll) await toContent(tabId, { type: "autoscroll-start", options: options.autoscroll });
    if (options.maxMs) scheduleLimit(current);
    return state;
  } catch (error) {
    await cleanup(current);
    setState({ status: "idle", error: friendlyError(error) });
    throw error;
  }
}

/** Para no limite de duração, descontando as pausas. */
function scheduleLimit(current: Recording) {
  const check = () => {
    if (rec !== current || !current.options.maxMs) return;
    const left = current.options.maxMs - elapsed();
    if (left <= 0) void stopRecording();
    else current.timers.push(setTimeout(check, Math.min(left, 1000)));
  };
  check();
}

export function pauseRecording() {
  if (!rec || state.status !== "recording") return state;
  setState({ status: "paused", pausedAt: Date.now() });
  void toContent(rec.tabId, { type: "autoscroll-control", paused: true }).catch(() => {});
  void badge("❚❚");
  return state;
}

export function resumeRecording() {
  if (!rec || state.status !== "paused" || !state.pausedAt) return state;
  setState({ status: "recording", pausedMs: state.pausedMs + (Date.now() - state.pausedAt), pausedAt: undefined });
  void toContent(rec.tabId, { type: "autoscroll-control", paused: false }).catch(() => {});
  void badge("REC");
  return state;
}

/** O auto scroll avisou que terminou. */
export function onAutoscrollDone(tabId: number) {
  if (rec?.tabId === tabId && rec.options.autoscroll?.stopAtEnd && state.status === "recording") void stopRecording();
}

export async function stopRecording(opts: { detached?: boolean } = {}): Promise<RecordingState> {
  const current = rec;
  if (!current) return state;
  if (state.status === "preparing" || state.status === "countdown") {
    current.aborted = true;
    return state;
  }
  if (state.status === "saving") return state;
  const t = elapsed() / 1000;
  setState({ status: "saving" });
  current.timers.forEach(clearTimeout);
  current.capturing = false;
  await toContent(current.tabId, { type: "autoscroll-stop" }).catch(() => {});

  let sessionId: string | undefined;
  let error: string | undefined;
  try {
    if (!current.frames) throw new Error("Nenhum quadro foi gravado. A aba estava visível?");
    const res = await request({
      type: "stop",
      t,
      meta: {
        url: current.url,
        title: current.title,
        viewport: current.options.size,
        theme: current.options.theme === "current" ? null : current.options.theme,
      },
    });
    if (res.ok) sessionId = res.sessionId;
    else error = res.error;
  } catch (e) {
    error = friendlyError(e);
  }
  await cleanup(current, opts.detached);
  setState({ status: "idle", sessionId, error, startedAt: undefined, pausedAt: undefined, pausedMs: 0 });
  if (sessionId) {
    const tab = await chrome.tabs.get(current.tabId).catch(() => undefined);
    await chrome.tabs.create({ url: chrome.runtime.getURL(`/compare.html?id=${sessionId}`), index: tab ? tab.index + 1 : undefined });
  }
  return state;
}

async function cleanup(current: Recording, detached = false) {
  current.timers.forEach(clearTimeout);
  if (rec === current) rec = null;
  await chrome.action.setBadgeText({ text: "" }).catch(() => {});
  await closeOffscreen();
  await toContent(current.tabId, { type: "capture-mode", on: false }).catch(() => {});
  if (detached || !sessions.has(current.tabId)) return;
  if (current.options.theme !== "current") await emulateTheme(current.tabId, null).catch(() => {});
  if (current.options.hideScrollbars) await hideScrollbars(current.tabId, false);
  await restoreMetrics(current.tabId, current.previous).catch(() => {});
}

export const isRecordingTab = (tabId: number) => rec?.tabId === tabId;
