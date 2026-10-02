import { applyMetrics, detach, friendlyError, sessions } from "../capture/cdp";
import {
  connectOffscreen,
  isRecordingTab,
  onAutoscrollDone,
  pauseRecording,
  recordingState,
  resumeRecording,
  startRecording,
  stopRecording,
} from "../capture/recorder";
import { CancelledError, runShots } from "../capture/screenshot";
import type {
  BackgroundMessage,
  ContentMessage,
  FramesMessage,
  PanelMessage,
  ShotsResponse,
  ViewportMessage,
  ViewportResponse,
  ViewportSpec,
} from "../shared/messages";

// ---------------------------------------------------------------------------
// Emulação de viewport (mesma tecnologia do "device mode" do DevTools)
// ---------------------------------------------------------------------------

async function setViewport(tabId: number, spec: ViewportSpec | null): Promise<ViewportResponse> {
  try {
    if (!spec) {
      await detach(tabId);
      return { ok: true, applied: null };
    }
    return { ok: true, applied: await applyMetrics(tabId, spec, { fit: true }) };
  } catch (error) {
    await detach(tabId);
    return { ok: false, error: friendlyError(error) };
  }
}

// ---------------------------------------------------------------------------
// Prints
// ---------------------------------------------------------------------------

const shooting = new Set<number>();
const cancelledShots = new Set<number>();

function broadcast(message: BackgroundMessage) {
  chrome.runtime.sendMessage(message).catch(() => {});
}

async function shots(tabId: number, options: Parameters<typeof runShots>[1]): Promise<ShotsResponse> {
  if (shooting.has(tabId)) return { ok: false, error: "Já existe uma captura em andamento nesta aba." };
  if (isRecordingTab(tabId)) return { ok: false, error: "Pare a gravação antes de tirar prints." };
  shooting.add(tabId);
  cancelledShots.delete(tabId);
  try {
    const session = await runShots(
      tabId,
      options,
      (progress) => broadcast({ type: "shots-progress", tabId, progress }),
      () => cancelledShots.has(tabId),
    );
    if (options.openGallery) {
      const tab = await chrome.tabs.get(tabId);
      await chrome.tabs.create({ url: chrome.runtime.getURL(`/compare.html?id=${session.id}`), index: tab.index + 1 });
    }
    return { ok: true, sessionId: session.id };
  } catch (error) {
    if (error instanceof CancelledError) return { ok: false, error: error.message };
    return { ok: false, error: friendlyError(error) };
  } finally {
    shooting.delete(tabId);
    cancelledShots.delete(tabId);
    broadcast({ type: "shots-progress", tabId, progress: null });
  }
}

// ---------------------------------------------------------------------------
// Palco responsivo: permite carregar a própria página em iframe nesta aba
// ---------------------------------------------------------------------------

const framedTabs = new Set<number>();

async function allowFrames(tabId: number, host: string) {
  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: [tabId],
    addRules: [
      {
        id: tabId,
        priority: 1,
        action: {
          type: chrome.declarativeNetRequest.RuleActionType.MODIFY_HEADERS,
          responseHeaders: [
            { header: "x-frame-options", operation: chrome.declarativeNetRequest.HeaderOperation.REMOVE },
            { header: "content-security-policy", operation: chrome.declarativeNetRequest.HeaderOperation.REMOVE },
            { header: "content-security-policy-report-only", operation: chrome.declarativeNetRequest.HeaderOperation.REMOVE },
          ],
        },
        condition: {
          tabIds: [tabId],
          requestDomains: [host],
          resourceTypes: [chrome.declarativeNetRequest.ResourceType.SUB_FRAME],
        },
      },
    ],
  });
  framedTabs.add(tabId);
}

async function revokeFrames(tabId: number) {
  if (!framedTabs.delete(tabId)) return;
  await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [tabId] }).catch(() => {});
}

// ---------------------------------------------------------------------------

export default defineBackground(() => {
  // Clique no ícone abre o painel lateral.
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);

  // Atalho (Alt+Shift+C): abre o painel e liga/desliga o modo inspecionar.
  chrome.commands.onCommand.addListener((command, tab) => {
    if (command !== "toggle-inspect" || !tab?.windowId) return;
    chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {});
    const message: BackgroundMessage = { type: "command-toggle" };
    chrome.runtime.sendMessage(message).catch(() => {
      /* painel ainda abrindo: ele liga a inspeção sozinho ao montar */
    });
  });

  // Atalho (Alt+Shift+R): para a gravação; sem gravação, o painel começa uma
  chrome.commands.onCommand.addListener((command, tab) => {
    if (command !== "toggle-recording") return;
    if (recordingState().status !== "idle") {
      void stopRecording();
      return;
    }
    if (tab?.windowId) chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {});
    broadcast({ type: "command-record" });
  });


  chrome.runtime.onMessage.addListener((message: ViewportMessage | FramesMessage | ContentMessage, sender, sendResponse) => {
    switch (message.type) {
      case "autoscroll-done":
        if (sender.tab?.id !== undefined) onAutoscrollDone(sender.tab.id);
        return;
      case "frames-allow":
        if (sender.tab?.id === undefined) return;
        allowFrames(sender.tab.id, message.host)
          .then(() => sendResponse({ ok: true }))
          .catch((error) => sendResponse({ ok: false, error: String(error) }));
        return true;
      case "frames-revoke":
        if (sender.tab?.id !== undefined) void revokeFrames(sender.tab.id);
        return;
      case "viewport-set":
        setViewport(message.tabId, message.viewport).then(sendResponse);
        return true;
      case "viewport-get":
        sendResponse({ ok: true, applied: sessions.get(message.tabId)?.applied ?? null } satisfies ViewportResponse);
        return;
      case "shots-run":
        shots(message.tabId, message.options).then(sendResponse);
        return true;
      case "shots-cancel":
        if (shooting.has(message.tabId)) cancelledShots.add(message.tabId);
        return;
      case "record-start":
        startRecording(message.tabId, message.options)
          .then((state) => sendResponse({ ok: true, state }))
          .catch((error) => sendResponse({ ok: false, error: friendlyError(error), state: recordingState() }));
        return true;
      case "record-pause":
        sendResponse({ ok: true, state: pauseRecording() });
        return;
      case "record-resume":
        sendResponse({ ok: true, state: resumeRecording() });
        return;
      case "record-stop":
        stopRecording().then((state) => sendResponse({ ok: true, state }));
        return true;
      case "record-get":
        sendResponse({ ok: true, state: recordingState() });
        return;
    }
  });

  // Usuário clicou em "Cancelar" na faixa de depuração, ou a aba fechou.
  chrome.debugger.onDetach.addListener((source) => {
    if (source.tabId === undefined || !sessions.has(source.tabId)) return;
    if (isRecordingTab(source.tabId)) void stopRecording({ detached: true });
    sessions.delete(source.tabId);
    const message: BackgroundMessage = { type: "viewport-reset", tabId: source.tabId };
    chrome.runtime.sendMessage(message).catch(() => {});
  });
  chrome.tabs.onRemoved.addListener((tabId) => {
    if (isRecordingTab(tabId)) void stopRecording({ detached: true });
    sessions.delete(tabId);
    void revokeFrames(tabId);
  });

  // Quando o painel fecha: remove o overlay e desfaz a emulação.
  chrome.runtime.onConnect.addListener((port) => {
    if (port.name === "offscreen") {
      connectOffscreen(port);
      return;
    }
    if (port.name !== "sidepanel") return;
    let tabId: number | undefined;
    port.onMessage.addListener((msg: { tabId?: number }) => {
      if (typeof msg.tabId === "number") tabId = msg.tabId;
    });
    port.onDisconnect.addListener(async () => {
      // painel fechado no meio da gravação: salva o que já foi gravado
      if (recordingState().status !== "idle") await stopRecording();
      for (const id of [...sessions.keys()]) void detach(id);
      for (const id of [...framedTabs]) void revokeFrames(id);
      if (tabId === undefined) return;
      const clear: PanelMessage = { type: "clear" };
      chrome.tabs.sendMessage(tabId, clear).catch(() => {});
    });
  });
});
