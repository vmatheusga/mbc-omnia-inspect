import type { FramesMessage, PanelMessage } from "../../shared/messages";
import { startController } from "./controller";

/**
 * Injetado sob demanda pelo painel (chrome.scripting). Desenha o contorno
 * azul, faz a seleção e envia o snapshot do elemento para o painel analisar.
 */
export default defineContentScript({
  matches: ["<all_urls>"],
  registration: "runtime",
  main() {
    const w = window as unknown as { __omniaInspect?: boolean };
    if (w.__omniaInspect) return;
    w.__omniaInspect = true;
    startController({
      send: (message) => {
        chrome.runtime.sendMessage(message).catch(() => {
          /* painel fechado */
        });
      },
      allowFrames: async () => {
        await chrome.runtime.sendMessage({ type: "frames-allow", host: location.hostname } satisfies FramesMessage);
      },
      onMessage: (handler) => {
        chrome.runtime.onMessage.addListener((message: PanelMessage, _sender, sendResponse) => {
          return handler(message, sendResponse);
        });
      },
    });
  },
});
