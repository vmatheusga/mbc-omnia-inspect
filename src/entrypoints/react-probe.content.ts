import { installProbeListener } from "../shared/react-fiber";

/**
 * Roda no "main world" da página para ler o React Fiber do elemento
 * selecionado (nome do componente e props reais, ex.: variant/size).
 * Só funciona em builds que preservam nomes (dev) ou com displayName.
 */
export default defineContentScript({
  matches: ["<all_urls>"],
  world: "MAIN",
  registration: "runtime",
  main() {
    installProbeListener();
  },
});
