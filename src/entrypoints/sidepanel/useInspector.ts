import { useCallback, useEffect, useRef, useState } from "react";
import { analyze } from "../../engine/analyze";
import type { InspectionResult } from "../../engine/types";
import { knowledgeIndex } from "../../knowledge";
import type {
  AppliedViewport,
  BackgroundMessage,
  ContentMessage,
  PanelMessage,
  PingResponse,
  RecordOptions,
  RecordingState,
  ShotOptions,
  ShotsProgress,
  ShotsResponse,
  StageMode,
  StageState,
  ViewportMessage,
  ViewportResponse,
  ViewportSpec,
} from "../../shared/messages";
import type { Requester } from "./lib/export";

export type Status = "connecting" | "ready" | "unsupported";

export interface ViewportControl {
  /** Emulação disponível (extensão). No playground, não. */
  supported: boolean;
  applied: AppliedViewport | null;
  busy: boolean;
  error?: string;
  set: (spec: ViewportSpec | null) => Promise<void>;
}

/** Pedido para abrir a aba Capturar: do palco (prints) ou do atalho de gravação. */
export type CaptureRequest = { kind: "shots"; devices: ViewportSpec[]; at: number } | { kind: "record"; at: number };

export interface CaptureControl {
  /** Prints e vídeo dependem do chrome.debugger (só na extensão). */
  supported: boolean;
  progress: ShotsProgress | null;
  runShots: (options: ShotOptions) => Promise<ShotsResponse>;
  cancelShots: () => void;
  recording: RecordingState;
  startRecording: (options: RecordOptions) => Promise<{ ok: boolean; error?: string }>;
  pauseRecording: () => void;
  resumeRecording: () => void;
  stopRecording: () => void;
  autoscroll: (change: { paused?: boolean; speed?: number }) => void;
  request: CaptureRequest | null;
  clearRequest: () => void;
}

export const IDLE_RECORDING: RecordingState = { status: "idle", pausedMs: 0 };

export interface StageControl {
  state: StageState | null;
  show: (devices: ViewportSpec[], mode: StageMode) => Promise<void>;
  hide: () => void;
}

export interface DownloadFile {
  filename: string;
  blob?: Blob;
  url?: string;
}

export interface Inspector {
  /** Muda quando a aba/página muda (para recarregar dados como as imagens). */
  pageKey: string;
  url?: string;
  status: Status;
  inspecting: boolean;
  result: InspectionResult | null;
  /** Todos os selecionados (Shift+clique); `result` é o primário. */
  results: InspectionResult[];
  primaryId: string | null;
  stale: boolean;
  toggleInspect: () => void;
  select: (id: string) => void;
  navigate: (direction: "parent" | "child" | "prev" | "next") => void;
  highlight: (id: string | null) => void;
  refresh: () => void;
  clear: () => void;
  deselect: (id: string) => void;
  setPrimary: (id: string) => void;
  retry: () => void;
  request: Requester;
  download: (file: DownloadFile) => Promise<void>;
  viewport: ViewportControl;
  stage: StageControl;
  capture: CaptureControl;
}

/**
 * Estado do painel independente do transporte: recebe mensagens do
 * controller da página, roda a análise e expõe as ações.
 */
export function usePanelCore(send: (message: PanelMessage) => void) {
  const [inspecting, setInspecting] = useState(false);
  const [results, setResults] = useState<InspectionResult[]>([]);
  const [primaryId, setPrimaryId] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const result = results.find((r) => r.element.id === primaryId) ?? results[results.length - 1] ?? null;
  const setResult = useCallback((value: null) => {
    if (value === null) setResults([]);
  }, []);
  const [stage, setStage] = useState<StageState | null>(null);
  const [captureRequest, setCaptureRequest] = useState<CaptureRequest | null>(null);

  const handle = useCallback(
    (message: ContentMessage) => {
      switch (message.type) {
        case "selection": {
          const analyses: InspectionResult[] = [];
          for (const input of message.inputs) {
            try {
              analyses.push(analyze(input, knowledgeIndex));
            } catch (error) {
              console.error("[Omnia Inspect] falha na análise", error);
            }
          }
          setResults(analyses);
          setPrimaryId(message.primaryId);
          setStale(false);
          if (analyses.length) {
            send({
              type: "labels",
              items: analyses.map((a) => ({
                id: a.element.id,
                text: [a.component.name, ...a.component.variants.filter((v) => !v.isDefault).map((v) => v.value)].join(" · "),
              })),
            });
          }
          break;
        }
        case "state":
          setInspecting(message.inspecting);
          break;
        case "selection-lost":
          setStale(true);
          break;
        case "stage-state":
          setStage(message.state);
          break;
        case "stage-capture":
          setCaptureRequest({ kind: "shots", devices: message.devices, at: Date.now() });
          break;
      }
    },
    [send],
  );

  const actions = {
    toggleInspect: () => send({ type: "set-inspecting", value: !inspecting }),
    select: (id: string) => send({ type: "select", id }),
    navigate: (direction: "parent" | "child" | "prev" | "next") => send({ type: "navigate", direction }),
    highlight: (id: string | null) => send({ type: "highlight", id }),
    refresh: () => send({ type: "refresh" }),
    clear: () => {
      setResults([]);
      send({ type: "clear" });
    },
    deselect: (id: string) => send({ type: "deselect", id }),
    setPrimary: (id: string) => {
      setPrimaryId(id);
      send({ type: "set-primary", id });
    },
  };

  return {
    inspecting,
    setInspecting,
    result,
    results,
    primaryId,
    setResult,
    stale,
    stage,
    setStage,
    captureRequest,
    setCaptureRequest,
    handle,
    actions,
  };
}

// ---------------------------------------------------------------------------
// Implementação Chrome (side panel)
// ---------------------------------------------------------------------------

async function ping(tabId: number): Promise<PingResponse | null> {
  try {
    const res = (await chrome.tabs.sendMessage(tabId, { type: "ping" } satisfies PanelMessage)) as PingResponse;
    return res?.ok ? res : null;
  } catch {
    return null;
  }
}

async function inject(tabId: number): Promise<PingResponse | null> {
  const existing = await ping(tabId);
  if (existing) return existing;
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["/content-scripts/react-probe.js"],
      world: "MAIN",
    });
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["/content-scripts/content.js"],
    });
    return await ping(tabId);
  } catch {
    return null;
  }
}

export function useInspector(): Inspector {
  const [url, setUrl] = useState<string>();
  const [pageKey, setPageKey] = useState("");
  const [status, setStatus] = useState<Status>("connecting");
  const [applied, setApplied] = useState<AppliedViewport | null>(null);
  const [viewportBusy, setViewportBusy] = useState(false);
  const [viewportError, setViewportError] = useState<string>();
  const [progress, setProgress] = useState<ShotsProgress | null>(null);
  const [recording, setRecording] = useState<RecordingState>(IDLE_RECORDING);
  const tabRef = useRef<number | undefined>(undefined);
  const portRef = useRef<chrome.runtime.Port | undefined>(undefined);
  const autoStarted = useRef(false);

  const send = useCallback((message: PanelMessage) => {
    const id = tabRef.current;
    if (id === undefined) return;
    chrome.tabs.sendMessage(id, message).catch(() => {
      /* aba sem content script */
    });
  }, []);

  const core = usePanelCore(send);
  const { setInspecting, setResult, setStage, setCaptureRequest, handle } = core;

  /** A captura restaura a emulação: relê o que está aplicado. */
  const refreshApplied = useCallback(() => {
    const id = tabRef.current;
    if (id === undefined) return;
    chrome.runtime
      .sendMessage({ type: "viewport-get", tabId: id } satisfies ViewportMessage)
      .then((res: ViewportResponse) => {
        if (tabRef.current === id) setApplied(res?.ok ? res.applied : null);
      })
      .catch(() => {});
  }, []);

  const attach = useCallback(
    async (id: number, pageUrl?: string) => {
      const previous = tabRef.current;
      if (previous !== undefined && previous !== id) {
        chrome.tabs.sendMessage(previous, { type: "clear" } satisfies PanelMessage).catch(() => {});
      }
      tabRef.current = id;
      setUrl(pageUrl);
      setPageKey(`${id}:${pageUrl ?? ""}:${Date.now()}`);
      setStatus("connecting");
      setViewportError(undefined);
      chrome.runtime
        .sendMessage({ type: "viewport-get", tabId: id } satisfies ViewportMessage)
        .then((res: ViewportResponse) => {
          if (tabRef.current === id) setApplied(res?.ok ? res.applied : null);
        })
        .catch(() => setApplied(null));
      portRef.current?.postMessage({ tabId: id });
      const state = await inject(id);
      if (tabRef.current !== id) return;
      if (!state) {
        setStatus("unsupported");
        setInspecting(false);
        return;
      }
      setStatus("ready");
      setInspecting(state.inspecting);
      if (!state.hasSelection) setResult(null);
      const stageRes = await chrome.tabs
        .sendMessage(id, { type: "stage-get" } satisfies PanelMessage)
        .catch(() => undefined);
      setStage((stageRes as { state?: StageState | null } | undefined)?.state ?? null);
      if (!autoStarted.current && !state.hasSelection) {
        autoStarted.current = true;
        send({ type: "set-inspecting", value: true });
      }
    },
    [send, setInspecting, setResult, setStage],
  );

  // Conexão com o background (para limpar o overlay quando o painel fechar)
  useEffect(() => {
    const port = chrome.runtime.connect({ name: "sidepanel" });
    portRef.current = port;
    if (tabRef.current !== undefined) port.postMessage({ tabId: tabRef.current });
    return () => port.disconnect();
  }, []);

  // Aba ativa e navegação
  useEffect(() => {
    let windowId: number | undefined;
    chrome.windows.getCurrent().then((w) => {
      windowId = w.id;
      chrome.tabs.query({ active: true, windowId }).then(([tab]) => {
        if (tab?.id !== undefined) void attach(tab.id, tab.url);
      });
    });
    // Galeria/vídeo da própria extensão: o painel continua na página de origem.
    // O Chrome não expõe a URL dessas abas (só temos activeTab), então pergunta aos contextos da extensão.
    const isOwnTab = async (tab: chrome.tabs.Tab) => {
      if (tab.url?.startsWith("http") || tab.id === undefined) return false;
      for (let i = 0; i < 3; i++) {
        const contexts = await chrome.runtime
          .getContexts({ contextTypes: [chrome.runtime.ContextType.TAB], tabIds: [tab.id] })
          .catch(() => []);
        if (contexts.length) return true;
        await new Promise((r) => setTimeout(r, 120)); // a página nova ainda está abrindo
      }
      return false;
    };
    const onActivated = (info: chrome.tabs.OnActivatedInfo) => {
      if (info.windowId !== windowId) return;
      chrome.tabs.get(info.tabId).then(async (tab) => {
        if (tabRef.current !== undefined && tabRef.current !== info.tabId && (await isOwnTab(tab))) return;
        setResult(null);
        void attach(info.tabId, tab.url);
      });
    };
    const onUpdated = (id: number, change: chrome.tabs.OnUpdatedInfo, tab: chrome.tabs.Tab) => {
      if (id !== tabRef.current) return;
      if (change.status === "loading" && change.url) setResult(null);
      if (change.status === "complete") void attach(id, tab.url);
    };
    chrome.tabs.onActivated.addListener(onActivated);
    chrome.tabs.onUpdated.addListener(onUpdated);
    return () => {
      chrome.tabs.onActivated.removeListener(onActivated);
      chrome.tabs.onUpdated.removeListener(onUpdated);
    };
  }, [attach, setResult]);

  // Mensagens do content script / background
  useEffect(() => {
    const listener = (message: ContentMessage | BackgroundMessage, sender: chrome.runtime.MessageSender) => {
      switch (message.type) {
        case "command-toggle":
          send({ type: "toggle-inspecting" });
          return;
        case "command-record":
          setCaptureRequest({ kind: "record", at: Date.now() });
          return;
        case "viewport-reset":
          if (message.tabId === tabRef.current) setApplied(null);
          return;
        case "shots-progress":
          if (message.tabId === tabRef.current) setProgress(message.progress);
          return;
        case "record-state":
          setRecording(message.state);
          if (message.state.status === "idle") refreshApplied();
          return;
      }
      if (sender.tab?.id !== tabRef.current) return;
      handle(message);
    };
    chrome.runtime.onMessage.addListener(listener);
    chrome.runtime
      .sendMessage({ type: "record-get" } satisfies ViewportMessage)
      .then((res: { state?: RecordingState }) => res?.state && setRecording(res.state))
      .catch(() => {});
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, [send, handle, setCaptureRequest, refreshApplied]);

  const request: Requester = useCallback(async <T,>(message: PanelMessage) => {
    const id = tabRef.current;
    if (id === undefined) return undefined;
    try {
      return (await chrome.tabs.sendMessage(id, message)) as T;
    } catch {
      return undefined;
    }
  }, []);

  const viewportCall = async (message: ViewportMessage) => {
    setViewportBusy(true);
    setViewportError(undefined);
    try {
      const res = (await chrome.runtime.sendMessage(message)) as ViewportResponse;
      if (!res?.ok) setViewportError(res?.error ?? "Falha ao emular o tamanho");
      else setApplied(res.applied);
    } finally {
      setViewportBusy(false);
    }
    // estilos mudaram: reanalisa o elemento selecionado
    setTimeout(() => send({ type: "refresh" }), 400);
  };

  return {
    pageKey,
    url,
    status,
    inspecting: core.inspecting,
    result: core.result,
    results: core.results,
    primaryId: core.primaryId,
    stale: core.stale,
    ...core.actions,
    retry: () => {
      if (tabRef.current !== undefined) void attach(tabRef.current, url);
    },
    request,
    download: async ({ filename, blob, url: fileUrl }) => {
      const href = blob ? URL.createObjectURL(blob) : fileUrl!;
      try {
        await chrome.downloads.download({ url: href, filename, conflictAction: "uniquify", saveAs: false });
      } finally {
        if (blob) setTimeout(() => URL.revokeObjectURL(href), 60_000);
      }
    },
    stage: {
      state: core.stage,
      show: async (devices, mode) => {
        const res = await request<{ state?: StageState | null }>({ type: "stage-show", devices, mode });
        if (res) setStage(res.state ?? null);
      },
      hide: () => send({ type: "stage-hide" }),
    },
    viewport: {
      supported: true,
      applied,
      busy: viewportBusy,
      error: viewportError,
      set: async (spec) => {
        if (tabRef.current === undefined) return;
        await viewportCall({ type: "viewport-set", tabId: tabRef.current, viewport: spec });
      },
    },
    capture: {
      supported: true,
      progress,
      runShots: async (options) => {
        const tabId = tabRef.current;
        if (tabId === undefined) return { ok: false, error: "Nenhuma aba ativa." };
        setProgress({ done: 0, total: 1, label: "Preparando…" });
        try {
          const res = (await chrome.runtime.sendMessage({ type: "shots-run", tabId, options } satisfies ViewportMessage)) as
            | ShotsResponse
            | undefined;
          return res ?? { ok: false, error: "A extensão não respondeu." };
        } finally {
          setProgress(null);
          refreshApplied();
          setTimeout(() => send({ type: "refresh" }), 400);
        }
      },
      cancelShots: () => {
        if (tabRef.current !== undefined) {
          void chrome.runtime.sendMessage({ type: "shots-cancel", tabId: tabRef.current } satisfies ViewportMessage);
        }
      },
      recording,
      startRecording: async (options) => {
        const tabId = tabRef.current;
        if (tabId === undefined) return { ok: false, error: "Nenhuma aba ativa." };
        const res = (await chrome.runtime.sendMessage({ type: "record-start", tabId, options } satisfies ViewportMessage)) as
          | { ok: boolean; error?: string; state?: RecordingState }
          | undefined;
        if (res?.state) setRecording(res.state);
        return res ?? { ok: false, error: "A extensão não respondeu." };
      },
      pauseRecording: () => void chrome.runtime.sendMessage({ type: "record-pause" } satisfies ViewportMessage),
      resumeRecording: () => void chrome.runtime.sendMessage({ type: "record-resume" } satisfies ViewportMessage),
      stopRecording: () => void chrome.runtime.sendMessage({ type: "record-stop" } satisfies ViewportMessage),
      autoscroll: (change) => send({ type: "autoscroll-control", ...change }),
      request: core.captureRequest,
      clearRequest: () => setCaptureRequest(null),
    },
  };
}
