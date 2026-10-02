import type { InspectInput, ReactInfo } from "../engine/types";
import type { PageAsset } from "./assets";

/** Painel → content script. */
export type PanelMessage =
  | { type: "ping" }
  | { type: "set-inspecting"; value: boolean }
  | { type: "toggle-inspecting" }
  | { type: "select"; id: string }
  | { type: "navigate"; direction: "parent" | "child" | "prev" | "next" }
  | { type: "highlight"; id: string | null }
  | { type: "refresh" }
  | { type: "clear" }
  | { type: "labels"; items: Array<{ id: string; text: string }> }
  | { type: "deselect"; id: string }
  | { type: "set-primary"; id: string }
  | { type: "collect-assets" }
  | { type: "reveal"; id: string }
  | { type: "fetch-asset"; url: string }
  | { type: "stage-show"; devices: ViewportSpec[]; mode: StageMode }
  | { type: "stage-hide" }
  | { type: "stage-get" }
  | CaptureContentMessage;

export type StageMode = "single" | "side-by-side";

export interface StageState {
  mode: StageMode;
  devices: ViewportSpec[];
  zoom: "fit" | number;
  syncScroll: boolean;
}

export interface AssetsResponse {
  ok: true;
  assets: PageAsset[];
  url: string;
  title: string;
}

export type FetchAssetResponse = { ok: true; dataUrl: string } | { ok: false; error: string };

/** Content script → painel. */
export type ContentMessage =
  | { type: "selection"; inputs: InspectInput[]; primaryId: string | null }
  | { type: "state"; inspecting: boolean; hasSelection: boolean }
  | { type: "selection-lost" }
  | { type: "stage-state"; state: StageState | null }
  /** Botão "Capturar" do palco: abre a aba Capturar com estes tamanhos. */
  | { type: "stage-capture"; devices: ViewportSpec[] }
  /** Auto scroll terminou (ou foi interrompido pelo usuário). */
  | { type: "autoscroll-done" };

/** Content script → background. */
export type FramesMessage = { type: "frames-allow"; host: string } | { type: "frames-revoke" };

/** Background → painel. */
export type BackgroundMessage =
  | { type: "command-toggle" }
  | { type: "command-record" }
  | { type: "viewport-reset"; tabId: number }
  | { type: "shots-progress"; tabId: number; progress: ShotsProgress | null }
  | { type: "record-state"; state: RecordingState };

// ---------------------------------------------------------------------------
// Viewport (emulação de dispositivo via chrome.debugger, no background)
// ---------------------------------------------------------------------------

export interface ViewportSpec {
  id: string;
  label: string;
  width: number;
  /** Ausente: usa a altura disponível da aba. */
  height?: number;
  /** Emula toque + user agent móvel. */
  mobile: boolean;
}

export interface AppliedViewport extends ViewportSpec {
  height: number;
  /** Zoom usado para caber na aba (1 = 100%). */
  scale: number;
}

/** Painel/galeria → background. */
export type ViewportMessage =
  | { type: "viewport-set"; tabId: number; viewport: ViewportSpec | null }
  | { type: "viewport-get"; tabId: number }
  | { type: "shots-run"; tabId: number; options: ShotOptions }
  | { type: "shots-cancel"; tabId: number }
  | { type: "record-start"; tabId: number; options: RecordOptions }
  | { type: "record-pause" }
  | { type: "record-resume" }
  | { type: "record-stop" }
  | { type: "record-get" };

export type ShotsResponse = { ok: true; sessionId: string } | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Captura: prints e vídeo
// ---------------------------------------------------------------------------

export type ThemeChoice = "current" | "light" | "dark" | "both";
export type Theme = "light" | "dark";
export type ShotArea = "viewport" | "full" | "element";
export type ImageFormat = "png" | "jpeg" | "webp";
export type FrameMode = "none" | "auto" | "phone" | "tablet" | "browser";

export interface ShotOptions {
  sizes: ViewportSpec[];
  area: ShotArea;
  theme: ThemeChoice;
  /** Também liga/desliga a classe `.dark` no <html> (Omnia/shadcn). */
  forceDarkClass: boolean;
  format: ImageFormat;
  dpr: 1 | 2 | 3;
  /** Respiro em volta do elemento (px). */
  padding: number;
  /** Rola a página até o fim antes, para carregar imagens lazy. */
  lazy: boolean;
  freeze: boolean;
  hideScrollbars: boolean;
  /** Apps em que quem rola é uma div: expande para caber a página inteira. */
  expandInner: boolean;
  delayMs: number;
  /** Moldura sugerida para a galeria e a exportação. */
  frame: FrameMode;
  openGallery: boolean;
}

export interface ShotsProgress {
  done: number;
  total: number;
  label: string;
}

export interface AutoscrollOptions {
  /** px por segundo. */
  speed: number;
  direction: "down" | "down-up";
  easing: boolean;
  startPauseMs: number;
  endPauseMs: number;
  /** Para a gravação quando o auto scroll termina. */
  stopAtEnd: boolean;
}

export interface RecordOptions {
  size: ViewportSpec;
  theme: Exclude<ThemeChoice, "both">;
  forceDarkClass: boolean;
  fps: 30 | 60;
  format: "mp4" | "webm";
  toTop: boolean;
  lazy: boolean;
  countdown: boolean;
  hideScrollbars: boolean;
  autoscroll: AutoscrollOptions | null;
  /** Limite de duração (ms); null = sem limite. */
  maxMs: number | null;
}

export type RecordingStatus = "idle" | "preparing" | "countdown" | "recording" | "paused" | "saving";

export interface RecordingState {
  status: RecordingStatus;
  tabId?: number;
  size?: ViewportSpec;
  countdownEndsAt?: number;
  startedAt?: number;
  /** Tempo total pausado (ms). */
  pausedMs: number;
  pausedAt?: number;
  maxMs?: number | null;
  autoscroll?: boolean;
  error?: string;
  /** Sessão salva da última gravação. */
  sessionId?: string;
}

/** Background/painel → content script (modo captura). */
export type CaptureContentMessage =
  | { type: "capture-mode"; on: boolean; freeze?: boolean; element?: boolean }
  | { type: "capture-theme"; theme: Theme | null }
  | { type: "capture-page"; toTop: boolean; lazy: boolean; expand: boolean }
  | { type: "capture-page-restore" }
  | { type: "capture-element"; padding: number }
  | { type: "autoscroll-start"; options: AutoscrollOptions }
  | { type: "autoscroll-control"; paused?: boolean; speed?: number }
  | { type: "autoscroll-stop" };

export interface CaptureModeResponse {
  ok: boolean;
  /** Elemento primário (área "elemento"). */
  element?: { label: string } | null;
}

export interface ElementRectResponse {
  ok: true;
  /** Coordenadas do documento (px CSS), já com o respiro. */
  rect: { x: number; y: number; width: number; height: number } | null;
}

export type ViewportResponse =
  | { ok: true; applied: AppliedViewport | null }
  | { ok: false; error: string };

export interface PingResponse {
  ok: true;
  inspecting: boolean;
  hasSelection: boolean;
}

// Ponte content (ISOLATED) ↔ react-probe (MAIN)
export const PROBE_REQUEST = "omnia-inspect:probe-request";
export const PROBE_RESPONSE = "omnia-inspect:probe-response";
export const PROBE_ATTR = "data-omnia-inspect-probe";

export interface ProbeRequest {
  source: typeof PROBE_REQUEST;
  requestId: string;
}

export interface ProbeResponse {
  source: typeof PROBE_RESPONSE;
  requestId: string;
  info?: ReactInfo;
}
