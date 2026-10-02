import { StrictMode, useEffect, useMemo } from "react";
import { createRoot } from "react-dom/client";
import { startController, type ContentTransport } from "../src/entrypoints/content/controller";
import { InspectorView } from "../src/entrypoints/sidepanel/App";
import { IDLE_RECORDING, usePanelCore, type Inspector } from "../src/entrypoints/sidepanel/useInspector";
import type { ContentMessage, PanelMessage, StageMode, StageState, ViewportSpec } from "../src/shared/messages";
import { installProbeListener } from "../src/shared/react-fiber";
import { DemoPage } from "./DemoPage";
import "./style.css";

// Transporte em memória: controller (página) ↔ painel no mesmo documento.
let toController: ((message: PanelMessage, respond: (r: unknown) => void) => void) | undefined;
let toPanel: ((message: ContentMessage) => void) | undefined;

const transport: ContentTransport = {
  send: (message) => setTimeout(() => toPanel?.(message)),
  onMessage: (handler) => {
    toController = handler;
  },
};
const sendToController = (message: PanelMessage) => setTimeout(() => toController?.(message, () => {}));
const requestController = <T,>(message: PanelMessage) =>
  new Promise<T | undefined>((resolve) => {
    if (!toController) return resolve(undefined);
    let done = false;
    const respond = (r: unknown) => {
      done = true;
      resolve(r as T);
    };
    toController(message, respond);
    setTimeout(() => !done && resolve(undefined), 15000);
  });

// `?bare`: só a página de demonstração (usada no teste e2e da extensão real)
const bare = new URLSearchParams(location.search).has("bare");

if (!bare) installProbeListener();
if (!bare) startController(transport, {
  ignore: (el) => !!el.closest("[data-inspector-panel]"),
  shieldBounds: () => document.querySelector("[data-demo-area]")?.getBoundingClientRect() ?? null,
  frameUrl: () => `${location.origin}/?bare`,
});

function useLocalInspector(): Inspector {
  const core = usePanelCore(sendToController);
  useEffect(() => {
    toPanel = core.handle;
    return () => {
      toPanel = undefined;
    };
  }, [core.handle]);
  return useMemo(
    () => ({
      pageKey: "playground",
      url: location.href,
      status: "ready" as const,
      inspecting: core.inspecting,
      result: core.result,
      results: core.results,
      primaryId: core.primaryId,
      stale: core.stale,
      ...core.actions,
      retry: () => {},
      request: requestController,
      download: async ({ filename, blob, url }: { filename: string; blob?: Blob; url?: string }) => {
        const a = document.createElement("a");
        a.href = blob ? URL.createObjectURL(blob) : url!;
        a.download = filename.split("/").pop()!;
        a.click();
      },
      stage: {
        state: core.stage,
        show: async (devices: ViewportSpec[], mode: StageMode) => {
          const res = await requestController<{ state?: StageState | null }>({ type: "stage-show", devices, mode });
          core.setStage(res?.state ?? null);
        },
        hide: () => sendToController({ type: "stage-hide" }),
      },
      viewport: {
        supported: false,
        applied: null,
        busy: false,
        set: async () => {},
      },
      capture: {
        supported: false,
        progress: null,
        runShots: async () => ({ ok: false as const, error: "Disponível apenas na extensão." }),
        cancelShots: () => {},
        recording: IDLE_RECORDING,
        startRecording: async () => ({ ok: false }),
        pauseRecording: () => {},
        resumeRecording: () => {},
        stopRecording: () => {},
        autoscroll: () => {},
        request: core.captureRequest,
        clearRequest: () => core.setCaptureRequest(null),
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [core.inspecting, core.result, core.results, core.primaryId, core.stale, core.stage, core.captureRequest],
  );
}

function Playground() {
  const inspector = useLocalInspector();
  return (
    <div className="flex h-full">
      <div data-demo-area className="min-w-0 flex-1 overflow-y-auto">
        <DemoPage />
      </div>
      <aside
        data-inspector-panel
        className="sticky top-0 h-full w-[380px] shrink-0 overflow-hidden border-l border-border bg-background"
      >
        <InspectorView inspector={inspector} />
      </aside>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>{bare ? <DemoPage /> : <Playground />}</StrictMode>,
);
