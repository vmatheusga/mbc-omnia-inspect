import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "wxt";

export default defineConfig({
  srcDir: "src",
  // Pasta visível no Finder (".output" fica oculta no seletor de arquivos do macOS)
  outDir: "dist",
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "Omnia Inspect",
    description:
      "Dev Mode para Omnia DS e shadcn/ui: componentes, variantes, tokens e desvios de padrão.",
    permissions: ["sidePanel", "scripting", "activeTab", "debugger", "downloads", "declarativeNetRequestWithHostAccess", "offscreen"],
    host_permissions: ["<all_urls>"],
    action: { default_title: "Omnia Inspect" },
    commands: {
      "toggle-inspect": {
        suggested_key: { default: "Alt+Shift+C", mac: "Alt+Shift+C" },
        description: "Ligar/desligar o modo inspecionar",
      },
      "toggle-recording": {
        suggested_key: { default: "Alt+Shift+R", mac: "Alt+Shift+R" },
        description: "Gravar vídeo da aba / parar a gravação",
      },
    },
  },
  vite: () => ({
    plugins: [tailwindcss()],
  }),
});
