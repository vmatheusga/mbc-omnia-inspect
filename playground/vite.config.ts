import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const omniaDs = path.resolve(import.meta.dirname, "../../omnia-ds");

// Playground: página com componentes reais do Omnia DS + o painel da extensão
// rodando na mesma página (transporte em memória). Útil para desenvolver e
// testar o motor sem recarregar a extensão.
export default defineConfig({
  root: import.meta.dirname,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "omnia-ui": path.join(omniaDs, "packages/ui/src/components/ui") },
    dedupe: ["react", "react-dom"],
  },
  server: {
    port: 5178,
    fs: { allow: [path.resolve(import.meta.dirname, ".."), omniaDs] },
  },
});
