import { describe, expect, it } from "vitest";
import { MAX_CAPTURE_PX, MAX_IMAGE_PX, chunkPlan, planShots, shotFilename, videoFilename } from "./capture-plan";
import { frameKindFor, frameLayout, resolveFrame } from "./device-frames";
import { BREAKPOINT_SPECS, DEVICE_PRESETS } from "./viewports";

const md = BREAKPOINT_SPECS.find((b) => b.label === "md")!;
const mobile = DEVICE_PRESETS.find((d) => d.id === "mobile-m")!;

describe("planShots", () => {
  it("multiplica tamanhos por temas, tema por fora", () => {
    const plan = planShots([mobile, md], "both");
    expect(plan.map((p) => `${p.theme}:${p.viewport.label}`)).toEqual([
      "light:Mobile M",
      "light:md",
      "dark:Mobile M",
      "dark:md",
    ]);
  });

  it("tema atual = um print por tamanho, sem tema", () => {
    expect(planShots([mobile, md], "current")).toEqual([
      { viewport: mobile, theme: null },
      { viewport: md, theme: null },
    ]);
  });
});

describe("chunkPlan", () => {
  it("uma faixa para páginas normais", () => {
    expect(chunkPlan(3200, 2)).toEqual({ chunks: [{ y: 0, height: 3200 }], truncated: false });
  });

  it("divide páginas altas respeitando o limite de textura", () => {
    const { chunks, truncated } = chunkPlan(12000, 2);
    expect(truncated).toBe(false);
    expect(chunks[0]).toEqual({ y: 0, height: MAX_CAPTURE_PX / 2 });
    expect(chunks.reduce((sum, c) => sum + c.height, 0)).toBe(12000);
    expect(chunks.every((c) => c.height * 2 <= MAX_CAPTURE_PX)).toBe(true);
  });

  it("corta no limite do canvas", () => {
    const { chunks, truncated } = chunkPlan(50000, 1);
    expect(truncated).toBe(true);
    expect(chunks.reduce((sum, c) => sum + c.height, 0)).toBe(MAX_IMAGE_PX);
  });
});

describe("nomes de arquivo", () => {
  it("host, rota, tamanho, densidade e tema", () => {
    const name = shotFilename(
      "http://localhost:5178/produtos/Livro Ação?x=1",
      { viewport: md, width: 768, height: 1024, dpr: 2, theme: "dark" },
      "png",
    );
    expect(name).toBe("localhost-5178-produtos-livro-acao-md-768x1024@2x-escuro.png");
  });

  it("sem rota, sem tema e com sufixo", () => {
    expect(
      shotFilename("https://mbc.com.br/", { viewport: mobile, width: 375, height: 812, dpr: 1, theme: null }, "jpg", "Card Header"),
    ).toBe("mbc-com-br-mobile-m-375x812-card-header.jpg");
  });

  it("vídeo com data", () => {
    expect(videoFilename("https://mbc.com.br/a", mobile, "mp4", "2026-10-01T12:30:00.000Z")).toBe(
      "mbc-com-br-a-mobile-m-2026-10-01-12-30.mp4",
    );
  });
});

describe("molduras", () => {
  it("escolhe o tipo pela largura", () => {
    expect(frameKindFor(375)).toBe("phone");
    expect(frameKindFor(768)).toBe("tablet");
    expect(frameKindFor(1440)).toBe("browser");
    expect(resolveFrame("none", 375)).toBeNull();
    expect(resolveFrame("auto", 1024)).toBe("tablet");
    expect(resolveFrame("browser", 375)).toBe("browser");
  });

  it("a tela fica dentro do corpo, com a captura no tamanho original", () => {
    for (const kind of ["phone", "tablet", "browser"] as const) {
      const L = frameLayout(kind, 750, 1624, 2);
      expect(L.screen.width).toBe(750);
      expect(L.screen.height).toBe(1624);
      expect(L.screen.x).toBeGreaterThanOrEqual(L.body.x);
      expect(L.screen.y + L.screen.height).toBeLessThanOrEqual(L.body.y + L.body.height);
      expect(L.width).toBe(L.body.width + L.body.x * 2);
    }
    // navegador: barra de 44px (× escala) acima da tela
    const browser = frameLayout("browser", 1440, 900, 1);
    expect(browser.screen.y - browser.body.y).toBe(44);
  });
});
