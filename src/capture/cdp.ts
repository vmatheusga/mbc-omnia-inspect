/**
 * Sessões do Chrome DevTools Protocol por aba (chrome.debugger): emulação de
 * tamanho (a mesma do "device mode" do DevTools), prints e screencast.
 */
import type { AppliedViewport, Theme, ViewportSpec } from "../shared/messages";

const MOBILE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Session {
  applied: AppliedViewport | null;
  userAgent?: string;
}

export const sessions = new Map<number, Session>();

export async function send<T = unknown>(tabId: number, method: string, params?: Record<string, unknown>): Promise<T> {
  return (await chrome.debugger.sendCommand({ tabId }, method, params)) as unknown as T;
}

export async function attach(tabId: number): Promise<Session> {
  const existing = sessions.get(tabId);
  if (existing) return existing;
  await chrome.debugger.attach({ tabId }, "1.3");
  const session: Session = { applied: null };
  try {
    const ua = await send<{ result: { value: string } }>(tabId, "Runtime.evaluate", {
      expression: "navigator.userAgent",
      returnByValue: true,
    });
    session.userAgent = ua.result.value;
  } catch {
    /* sem UA original: não sobrescrevemos o UA */
  }
  sessions.set(tabId, session);
  return session;
}

export async function detach(tabId: number) {
  if (!sessions.has(tabId)) return;
  sessions.delete(tabId);
  try {
    await send(tabId, "Emulation.clearDeviceMetricsOverride");
  } catch {
    /* aba fechada */
  }
  await chrome.debugger.detach({ tabId }).catch(() => {});
}

export interface MetricsOptions {
  /** Reduz o zoom para o tamanho caber na aba (o que o usuário vê). */
  fit: boolean;
  /** Densidade de pixels (0 = a da tela). */
  dpr?: number;
}

export async function applyMetrics(tabId: number, spec: ViewportSpec, opts: MetricsOptions): Promise<AppliedViewport> {
  const session = await attach(tabId);
  const tab = await chrome.tabs.get(tabId);
  const available = { width: tab.width ?? 1280, height: tab.height ?? 800 };
  let scale = opts.fit ? Math.min(1, available.width / spec.width) : 1;
  if (opts.fit && spec.height) scale = Math.min(scale, available.height / spec.height);
  scale = Math.max(0.1, Math.round(scale * 1000) / 1000);
  const height = spec.height ?? Math.floor(available.height / scale);

  await send(tabId, "Emulation.setDeviceMetricsOverride", {
    width: spec.width,
    height,
    deviceScaleFactor: opts.dpr ?? 0,
    mobile: spec.mobile,
    scale,
    screenWidth: spec.width,
    screenHeight: height,
  });
  await send(tabId, "Emulation.setTouchEmulationEnabled", { enabled: spec.mobile, maxTouchPoints: spec.mobile ? 5 : 1 });
  if (session.userAgent) {
    await send(tabId, "Emulation.setUserAgentOverride", { userAgent: spec.mobile ? MOBILE_UA : session.userAgent });
  }
  const applied: AppliedViewport = { ...spec, height, scale };
  session.applied = applied;
  return applied;
}

/** Volta ao que o dev estava vendo antes de uma captura. */
export async function restoreMetrics(tabId: number, previous: AppliedViewport | null) {
  if (previous) await applyMetrics(tabId, previous, { fit: true });
  else await detach(tabId);
}

/** `prefers-color-scheme` emulado (null = o do sistema). */
export async function emulateTheme(tabId: number, theme: Theme | null) {
  await send(tabId, "Emulation.setEmulatedMedia", {
    features: theme ? [{ name: "prefers-color-scheme", value: theme }] : [],
  });
}

export async function hideScrollbars(tabId: number, hidden: boolean) {
  await send(tabId, "Emulation.setScrollbarsHidden", { hidden }).catch(() => {});
}

export function friendlyError(error: unknown): string {
  const text = String((error as Error)?.message ?? error);
  if (/Another debugger|already attached/i.test(text)) return "Outra ferramenta já está depurando esta aba.";
  if (/Cannot access|cannot attach|chrome:\/\//i.test(text)) return "O Chrome não permite capturar esta página.";
  if (/No tab with given id|No target/i.test(text)) return "A aba foi fechada.";
  return text;
}

/** Garante o content script na aba (o painel injeta, mas o atalho pode vir antes). */
export async function ensureContent(tabId: number) {
  const ping = () =>
    chrome.tabs
      .sendMessage(tabId, { type: "ping" })
      .then((r: { ok?: boolean } | undefined) => !!r?.ok)
      .catch(() => false);
  if (await ping()) return;
  await chrome.scripting.executeScript({ target: { tabId }, files: ["/content-scripts/react-probe.js"], world: "MAIN" });
  await chrome.scripting.executeScript({ target: { tabId }, files: ["/content-scripts/content.js"] });
  if (!(await ping())) throw new Error("Não foi possível preparar a página para a captura.");
}

/** Mensagem para o content script, com resposta tipada. */
export function toContent<T = { ok: boolean }>(tabId: number, message: unknown): Promise<T> {
  return chrome.tabs.sendMessage(tabId, message) as Promise<T>;
}

export function base64ToBlob(data: string, type: string): Blob {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type });
}
