/**
 * Teste ponta a ponta da extensão compilada (dist/chrome-mv3) num Chrome for
 * Testing controlado pelo Playwright. Requer o playground rodando:
 *   pnpm playground   (em outro terminal)
 *   pnpm build && pnpm e2e
 */
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { chromium, type Page } from "playwright-core";

const root = path.resolve(import.meta.dirname, "..");
const dist = path.join(root, "dist/chrome-mv3");
const pageUrl = process.env.E2E_URL ?? "http://localhost:5178/?bare";
const executablePath =
  process.env.CHROME_PATH ??
  (() => {
    const base = path.join(os.homedir(), "Library/Caches/ms-playwright");
    const dir = fs.readdirSync(base).filter((d) => /^chromium-\d+$/.test(d)).sort().pop();
    if (!dir) throw new Error("Chrome for Testing não encontrado; defina CHROME_PATH");
    return path.join(base, dir, "chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
  })();

let failures = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? "✓" : "✗"} ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`);
  if (!ok) failures++;
}

const userDir = fs.mkdtempSync(path.join(os.tmpdir(), "omnia-e2e-"));
const context = await chromium.launchPersistentContext(userDir, {
  executablePath,
  headless: true,
  args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
  viewport: { width: 1280, height: 800 },
});

try {
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
  const extensionId = new URL(worker.url()).host;
  check("extensão carregada", !!extensionId, extensionId);

  const page = await context.newPage();
  await page.goto(pageUrl);
  await page.waitForSelector('[data-slot="button"]');

  // Página da extensão usada como "harness" (tem acesso às APIs chrome.*)
  const harness = await context.newPage();
  await harness.goto(`chrome-extension://${extensionId}/compare.html`);
  const tabId: number = await harness.evaluate(async (url) => {
    const tabs = await chrome.tabs.query({});
    return tabs.find((t) => t.url?.startsWith(url.split("?")[0]))!.id!;
  }, pageUrl);
  await page.bringToFront();

  const call = <T>(message: unknown) => harness.evaluate((m) => chrome.runtime.sendMessage(m), message) as Promise<T>;
  const innerWidth = (p: Page) => p.evaluate(() => window.innerWidth);

  // ------------------------------------------------------------- Viewport
  const mobile = { id: "mobile-m", label: "Mobile M", width: 375, height: 812, mobile: true };
  const res = await call<{ ok: boolean; applied?: { width: number; scale: number }; error?: string }>({
    type: "viewport-set",
    tabId,
    viewport: mobile,
  });
  check("viewport-set responde ok", res.ok, res);
  check("página emulada em 375px", (await innerWidth(page)) === 375, await innerWidth(page));
  const env = await page.evaluate(() => ({ touch: navigator.maxTouchPoints, ua: navigator.userAgent.slice(0, 40) }));
  check("touch + UA móvel", env.touch > 0 && /iPhone/.test(env.ua), env);
  // md:flex-row não deve estar ativo em 375px
  const direction375 = await page.evaluate(
    () => getComputedStyle(document.querySelector("img[alt^='Capa']")!.parentElement!).flexDirection,
  );
  check("layout responsivo em 375px (flex-col)", direction375 === "column", direction375);

  await call({ type: "viewport-set", tabId, viewport: { id: "bp-md", label: "md", width: 768, mobile: false } });
  const direction768 = await page.evaluate(
    () => getComputedStyle(document.querySelector("img[alt^='Capa']")!.parentElement!).flexDirection,
  );
  check("breakpoint md em 768px (flex-row)", (await innerWidth(page)) === 768 && direction768 === "row", direction768);

  await call({ type: "viewport-set", tabId, viewport: null });
  check("volta ao tamanho real", (await innerWidth(page)) === 1280, await innerWidth(page));

  // ------------------------------------------------------- Prints/galeria
  type ShotInfo = { label: string; theme: string | null; width: number; height: number; px: number[] | null; type?: string };
  type DbSession = { id: string; kind: string; shots?: ShotInfo[]; video?: { mime: string; size: number; durationMs: number; width: number; height: number; frames: number } };
  /** Sessões salvas em IndexedDB, com o tamanho real de cada imagem e um pixel de amostra. */
  const latestSession = () =>
    harness.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open("omnia-inspect-captures", 1);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      const all = await new Promise<Array<Record<string, any>>>((resolve) => {
        const req = db.transaction("sessions").objectStore("sessions").getAll();
        req.onsuccess = () => resolve(req.result);
      });
      db.close();
      const s = all.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
      if (!s) return null;
      const shots = [];
      for (const shot of s.shots ?? []) {
        let info = { width: 0, height: 0, px: null as number[] | null };
        if (shot.blob) {
          const bmp = await createImageBitmap(shot.blob);
          const c = new OffscreenCanvas(bmp.width, bmp.height);
          const ctx = c.getContext("2d")!;
          ctx.drawImage(bmp, 0, 0);
          info = { width: bmp.width, height: bmp.height, px: [...ctx.getImageData(Math.floor(bmp.width / 2), 4, 1, 1).data] };
        }
        shots.push({ label: shot.viewport.label, theme: shot.theme, type: shot.blob?.type, ...info });
      }
      return {
        id: s.id,
        kind: s.kind,
        shots,
        video: s.video && {
          mime: s.video.mime,
          size: s.video.blob.size,
          durationMs: s.video.durationMs,
          width: s.video.width,
          height: s.video.height,
          frames: s.video.frames,
        },
      };
    }) as Promise<DbSession | null>;
  const laptop = { id: "laptop", label: "Laptop", width: 1280, height: 800, mobile: false };
  const shotOptions = {
    sizes: [mobile, laptop],
    area: "viewport",
    theme: "current",
    forceDarkClass: true,
    format: "png",
    dpr: 1,
    padding: 0,
    lazy: true,
    freeze: true,
    hideScrollbars: true,
    expandInner: true,
    delayMs: 300,
    frame: "none",
    openGallery: false,
  };
  const runShots = (options: Record<string, unknown>) =>
    call<{ ok: boolean; sessionId?: string; error?: string }>({ type: "shots-run", tabId, options: { ...shotOptions, ...options } });

  const darkBefore = await page.evaluate(() => document.documentElement.classList.contains("dark"));
  const galleryPromise = context.waitForEvent("page");
  const themed = await runShots({ theme: "both", dpr: 2, openGallery: true });
  check("prints em 2 tamanhos × 2 temas", themed.ok, themed);
  const gallery = await galleryPromise;
  await gallery.waitForSelector("figure img");
  const figures = await gallery.$$eval("figure", (figs) => figs.length);
  check("galeria mostra as 4 imagens", figures === 4, figures);
  const themedDb = (await latestSession())!;
  const sizes = themedDb.shots!.map((s) => `${s.label}:${s.theme}:${s.width}x${s.height}:${s.type}`);
  check(
    "PNG em 2x (750 e 2560 px de largura)",
    themedDb.shots!.length === 4 &&
      themedDb.shots!.every((s) => s.type === "image/png") &&
      themedDb.shots!.filter((s) => s.label === "Mobile M").every((s) => s.width === 750 && s.height === 1624) &&
      themedDb.shots!.filter((s) => s.label === "Laptop").every((s) => s.width === 2560),
    sizes,
  );
  const lum = (px: number[] | null) => (px ? px[0] + px[1] + px[2] : -1);
  const light = themedDb.shots!.find((s) => s.label === "Laptop" && s.theme === "light")!;
  const dark = themedDb.shots!.find((s) => s.label === "Laptop" && s.theme === "dark")!;
  check("tema escuro deixa a página escura", lum(dark.px) < lum(light.px), { claro: light.px, escuro: dark.px });
  check(
    "página restaurada após os prints (tamanho e tema)",
    (await innerWidth(page)) === 1280 &&
      (await page.evaluate(() => document.documentElement.classList.contains("dark"))) === darkBefore,
  );
  await gallery.close();

  const full = await runShots({ sizes: [mobile], area: "full" });
  const fullDb = (await latestSession())!;
  check("página inteira mais alta que a tela", full.ok && fullDb.shots![0].height > 812, fullDb.shots?.[0]);

  // Palco aberto: o print mostra a página, não as molduras
  await harness.evaluate(
    (id) => chrome.tabs.sendMessage(id, { type: "stage-show", mode: "single", devices: [{ id: "mobile-m", label: "Mobile M", width: 375, height: 812, mobile: true }] }),
    tabId,
  );
  await runShots({ sizes: [laptop] });
  const clean = (await latestSession())!.shots![0];
  const stageColor = [27, 29, 31];
  check(
    "palco e overlay não aparecem no print",
    !!clean.px && clean.px.slice(0, 3).some((v, i) => Math.abs(v - stageColor[i]) > 12),
    clean.px,
  );
  check("palco volta depois do print", await page.evaluate(() => (document.querySelector("omnia-inspect-stage") as HTMLElement | null)?.style.display === ""));
  await harness.evaluate((id) => chrome.tabs.sendMessage(id, { type: "stage-hide" }), tabId);

  // --------------------------------------------------- Content script/imagens
  await harness.evaluate(async (id) => {
    await chrome.scripting.executeScript({ target: { tabId: id }, files: ["/content-scripts/react-probe.js"], world: "MAIN" });
    await chrome.scripting.executeScript({ target: { tabId: id }, files: ["/content-scripts/content.js"] });
  }, tabId);
  const assets = await harness.evaluate(
    (id) => chrome.tabs.sendMessage(id, { type: "collect-assets" }),
    tabId,
  ) as { assets: Array<{ kind: string; format: string; name: string; count: number }> };
  const svgs = assets.assets.filter((a) => a.kind === "svg");
  const images = assets.assets.filter((a) => a.kind === "image");
  check("SVGs separados das imagens", svgs.length > 0 && images.length >= 3, {
    svg: svgs.map((a) => a.name),
    imagens: images.map((a) => `${a.name}.${a.format}`),
  });
  check(
    "formatos das imagens",
    ["jpg", "gif", "png"].every((f) => images.some((a) => a.format === f)),
  );
  const fetched = await harness.evaluate(
    (id) => chrome.tabs.sendMessage(id, { type: "fetch-asset", url: "/capa-livro.jpg" }),
    tabId,
  ) as { ok: boolean; dataUrl?: string };
  check("fetch-asset pela página", fetched.ok && !!fetched.dataUrl?.startsWith("data:image/jpeg"));

  // ------------------------------------------------------------ Inspeção
  // Coleta as mensagens "selection" no harness (painel simulado)
  await harness.evaluate(() => {
    const w = window as unknown as { __selections: unknown[] };
    w.__selections = [];
    chrome.runtime.onMessage.addListener((m) => {
      if (m.type === "selection") {
        w.__selections.push(
          m.inputs.map((i: { element: { slot?: string; tag: string; react?: { name?: string } }; page: { viewportWidth: number } }) => ({
            slot: i.element.slot,
            tag: i.element.tag,
            component: i.element.react?.name,
            viewport: i.page.viewportWidth,
          })),
        );
      }
    });
  });
  type Sel = Array<{ slot?: string; tag: string; component?: string; viewport?: number }>;
  const nextSelection = async (): Promise<Sel> => {
    const count = await harness.evaluate(() => (window as unknown as { __selections: unknown[] }).__selections.length);
    await harness.waitForFunction((n) => (window as unknown as { __selections: unknown[] }).__selections.length > n, count);
    return harness.evaluate(() => {
      const list = (window as unknown as { __selections: Sel[] }).__selections;
      return list[list.length - 1];
    }) as Promise<Sel>;
  };
  const clickAt = async (x: number, y: number, modifier?: "Meta" | "Shift" | "Alt") => {
    const sel = nextSelection();
    if (modifier) await page.keyboard.down(modifier);
    await page.mouse.move(x, y);
    await page.mouse.click(x, y);
    if (modifier) await page.keyboard.up(modifier);
    return sel;
  };
  const centerOf = async (locator: ReturnType<Page["locator"]>) => {
    const b = (await locator.boundingBox())!;
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  };
  const ping = () => harness.evaluate((id) => chrome.tabs.sendMessage(id, { type: "ping" }), tabId) as Promise<{ inspecting: boolean }>;
  const overlayData = (key: string) =>
    page.evaluate((k) => (document.querySelector("omnia-inspect-overlay") as HTMLElement | null)?.dataset[k], key);

  await harness.evaluate((id) => chrome.tabs.sendMessage(id, { type: "set-inspecting", value: true }), tabId);
  await page.bringToFront();

  const brandCenter = await centerOf(page.getByRole("button", { name: "Brand" }));
  const first = await clickAt(brandCenter.x, brandCenter.y);
  check("inspeção envia o elemento com React props", first[0]?.slot === "button" && first[0]?.component === "Button", first);
  check("inspeção continua ativa após o clique", (await ping()).inspecting === true);

  const iconCenter = await centerOf(page.getByRole("button", { name: "Adicionar" }).locator("svg"));
  const smart = await clickAt(iconCenter.x, iconCenter.y);
  check("clique no ícone seleciona o Button (componente)", smart[0]?.slot === "button", smart);
  const deep = await clickAt(iconCenter.x, iconCenter.y, "Meta");
  check("⌘/Ctrl + clique seleciona a camada exata (svg)", deep[0]?.tag === "svg", deep);

  await clickAt(brandCenter.x, brandCenter.y);
  const outlineCenter = await centerOf(page.getByRole("button", { name: "Outline" }));
  const multi = await clickAt(outlineCenter.x, outlineCenter.y, "Shift");
  check(
    "Shift + clique adiciona à seleção",
    multi.length === 2 && (await overlayData("selectedCount")) === "2",
    { inputs: multi.length, overlay: await overlayData("selectedCount") },
  );

  const secondaryCenter = await centerOf(page.getByRole("button", { name: "Secondary" }));
  await page.keyboard.down("Alt");
  await page.mouse.move(secondaryCenter.x, secondaryCenter.y);
  await page.waitForTimeout(150);
  const measured = Number(await overlayData("measureCount"));
  await page.keyboard.up("Alt");
  check("Alt + hover mede a distância", measured > 0, measured);

  // Print do elemento selecionado (o primário é o Outline)
  const outlineBox = (await page.getByRole("button", { name: "Outline" }).boundingBox())!;
  const element = await runShots({ sizes: [laptop], area: "element", padding: 0 });
  const elementShot = (await latestSession())!.shots![0];
  check(
    "print do elemento tem o tamanho do elemento",
    element.ok && Math.abs(elementShot.width - outlineBox.width) <= 2 && Math.abs(elementShot.height - outlineBox.height) <= 2,
    { print: [elementShot.width, elementShot.height], elemento: [outlineBox.width, outlineBox.height], erro: element.error },
  );
  check("inspeção volta ligada depois do print", (await ping()).inspecting === true);

  // ------------------------------------------------------------- Vídeo
  await page.evaluate(() => window.scrollTo(0, 0));
  const videoTab = context.waitForEvent("page");
  const started = await call<{ ok: boolean; error?: string }>({
    type: "record-start",
    tabId,
    options: {
      size: mobile,
      theme: "current",
      forceDarkClass: true,
      fps: 30,
      format: "mp4",
      toTop: true,
      lazy: false,
      countdown: false,
      hideScrollbars: true,
      autoscroll: { speed: 600, direction: "down", easing: true, startPauseMs: 300, endPauseMs: 300, stopAtEnd: true },
      maxMs: 8000,
    },
  });
  check("gravação começa", started.ok, started);
  await page.bringToFront();
  await page.waitForTimeout(1500);
  const scrolledWhileRecording = await page.evaluate(() => {
    const doc = document.scrollingElement!;
    return doc.scrollTop;
  });
  check("auto scroll rola a página durante a gravação", scrolledWhileRecording > 0, scrolledWhileRecording);
  const finished = await (async () => {
    for (let i = 0; i < 60; i++) {
      const res = await call<{ state: { status: string; error?: string; sessionId?: string } }>({ type: "record-get" });
      if (res.state.status === "idle") return res.state;
      await page.waitForTimeout(250);
    }
    return null;
  })();
  check("gravação para sozinha no fim da rolagem", !!finished?.sessionId, finished);
  const videoDb = (await latestSession())!;
  check(
    "vídeo salvo (MP4 ou WebM) com duração",
    videoDb.kind === "video" && !!videoDb.video && videoDb.video.size > 1000 && videoDb.video.durationMs > 1000 && videoDb.video.width === 374 && videoDb.video.height === 812,
    videoDb.video,
  );
  const fps = videoDb.video!.frames / (videoDb.video!.durationMs / 1000);
  check("vídeo tem quadros suficientes (≥ 8 por segundo)", fps >= 8, { frames: videoDb.video!.frames, fps: Math.round(fps * 10) / 10 });
  const player = await videoTab;
  const playable = await player
    .waitForFunction(() => (document.querySelector("video") as HTMLVideoElement | null)?.readyState! >= 2, null, { timeout: 8000 })
    .then(() => player.evaluate(() => (document.querySelector("video") as HTMLVideoElement).duration))
    .catch(() => 0);
  check("página do vídeo toca o arquivo", playable > 1, playable);
  await player.close();
  check("página restaurada após a gravação", (await innerWidth(page)) === 1280 && (await ping()).inspecting === true);
  await page.bringToFront();

  await harness.evaluate((id) => chrome.tabs.sendMessage(id, { type: "set-inspecting", value: false }), tabId);
  await harness.evaluate(
    (id) =>
      chrome.tabs.sendMessage(id, {
        type: "stage-show",
        mode: "side-by-side",
        devices: [
          { id: "mobile-m", label: "Mobile M", width: 375, height: 812, mobile: true },
          { id: "laptop", label: "Laptop", width: 1280, height: 800, mobile: false },
        ],
      }),
    tabId,
  );
  await page.bringToFront();

  // ------------------------------------------ Rolagem das molduras (lado a lado)
  {
    const frameScroll = () =>
      page.evaluate(() =>
        [...(document.querySelector("omnia-inspect-stage")?.shadowRoot?.querySelectorAll("iframe") ?? [])].map((f) =>
          Math.round(f.contentWindow?.scrollY ?? -1),
        ),
      );
    await page.waitForTimeout(2500);
    const firstFrame = await page.evaluate(() => {
      const f = document.querySelector("omnia-inspect-stage")!.shadowRoot!.querySelector("iframe")!;
      const r = f.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + Math.min(r.height / 2, 300) };
    });
    await page.mouse.move(firstFrame.x, firstFrame.y);
    await page.mouse.wheel(0, 600);
    await page.waitForTimeout(900);
    const independent = await frameScroll();
    check("rolagem independente por moldura", independent[0] > 0 && independent.slice(1).every((y) => y === 0), independent);

    // liga "Rolar juntos" e confere que não fica oscilando
    await page.evaluate(() => {
      const label = [...document.querySelector("omnia-inspect-stage")!.shadowRoot!.querySelectorAll("label")].find((l) =>
        l.textContent?.includes("Rolar juntos"),
      );
      (label?.querySelector("input") as HTMLInputElement | null)?.click();
    });
    await page.mouse.move(firstFrame.x, firstFrame.y);
    await page.mouse.wheel(0, 500);
    await page.waitForTimeout(900);
    const a = await frameScroll();
    await page.waitForTimeout(500);
    const b = await frameScroll();
    check(
      "rolar juntos acompanha sem vai-e-volta",
      a.slice(1).every((y) => y > 0) && JSON.stringify(a) === JSON.stringify(b),
      { depois: a, estavel: b },
    );
  }
  await harness.evaluate((id) => chrome.tabs.sendMessage(id, { type: "stage-hide" }), tabId);

  // ------------------------------------------------ Palco responsivo (iframes)
  // Servidor que proíbe iframes: a extensão precisa liberar só nesta aba.
  const server = http.createServer((_req, res) => {
    res.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "x-frame-options": "DENY",
      "content-security-policy": "frame-ancestors 'none'",
    });
    res.end(`<!doctype html><html><head><meta name="viewport" content="width=device-width">
      <style>body{margin:0;font-family:sans-serif}.box{display:flex;flex-direction:column;gap:8px;padding:16px}
      @media (min-width:768px){.box{flex-direction:row}}</style></head>
      <body><div class="box"><button data-slot="button" class="bg-primary">Comprar</button><span>Texto</span></div></body></html>`);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as { port: number }).port;
  await page.goto(`http://127.0.0.1:${port}/`);
  await harness.evaluate(async (id) => {
    await chrome.scripting.executeScript({ target: { tabId: id }, files: ["/content-scripts/react-probe.js"], world: "MAIN" });
    await chrome.scripting.executeScript({ target: { tabId: id }, files: ["/content-scripts/content.js"] });
  }, tabId);

  const frameInfo = () =>
    page.evaluate(() => {
      const frames = [...(document.querySelector("omnia-inspect-stage")?.shadowRoot?.querySelectorAll("iframe") ?? [])];
      return frames.map((f) => {
        const doc = f.contentDocument;
        const box = doc?.querySelector(".box");
        return {
          width: f.contentWindow?.innerWidth,
          loaded: !!doc?.body,
          direction: box ? getComputedStyle(box).flexDirection : null,
        };
      });
    });

  await harness.evaluate(
    (id) =>
      chrome.tabs.sendMessage(id, {
        type: "stage-show",
        mode: "single",
        devices: [{ id: "mobile-m", label: "Mobile M", width: 375, height: 812, mobile: true }],
      }),
    tabId,
  );
  await page.waitForTimeout(1500);
  const single = await frameInfo();
  check(
    "moldura 375px carrega mesmo com X-Frame-Options: DENY",
    single.length === 1 && single[0].loaded && single[0].width === 375 && single[0].direction === "column",
    single,
  );

  await harness.evaluate(
    (id) =>
      chrome.tabs.sendMessage(id, {
        type: "stage-show",
        mode: "side-by-side",
        devices: [
          { id: "bp-base", label: "base", width: 375, height: 812, mobile: true },
          { id: "bp-md", label: "md", width: 768, mobile: false },
          { id: "bp-lg", label: "lg", width: 1024, mobile: false },
        ],
      }),
    tabId,
  );
  await page.waitForTimeout(1500);
  const side = await frameInfo();
  check(
    "lado a lado: breakpoints respondem em cada moldura",
    side.map((f) => `${f.width}:${f.direction}`).join(",") === "375:column,768:row,1024:row",
    side,
  );

  // Inspecionar dentro da moldura md (768)
  await harness.evaluate((id) => chrome.tabs.sendMessage(id, { type: "set-inspecting", value: true }), tabId);
  await page.bringToFront();
  const point = await page.evaluate(() => {
    const frame = [...document.querySelector("omnia-inspect-stage")!.shadowRoot!.querySelectorAll("iframe")][1];
    const fr = frame.getBoundingClientRect();
    const s = fr.width / frame.offsetWidth;
    const br = frame.contentDocument!.querySelector("button")!.getBoundingClientRect();
    return { x: fr.left + (br.left + br.width / 2) * s, y: fr.top + (br.top + br.height / 2) * s };
  });
  const inFrame = (await clickAt(point.x, point.y))[0];
  check("inspeção dentro da moldura md", inFrame.slot === "button" && inFrame.viewport === 768, inFrame);

  // Com a inspeção ligada, a barra do palco continua clicável (botão Capturar)
  await harness.evaluate(() => {
    const w = window as unknown as { __types: string[] };
    w.__types = [];
    chrome.runtime.onMessage.addListener((m) => void w.__types.push(m.type));
  });
  const captureButton = await page.evaluate(() => {
    const b = [...document.querySelector("omnia-inspect-stage")!.shadowRoot!.querySelectorAll("button")].find((x) =>
      x.textContent?.includes("Capturar"),
    )!;
    const r = b.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.mouse.click(captureButton.x, captureButton.y);
  await page.waitForTimeout(400);
  check(
    "botão Capturar do palco responde com a inspeção ligada",
    (await harness.evaluate(() => (window as unknown as { __types: string[] }).__types)).includes("stage-capture"),
  );

  await harness.evaluate((id) => chrome.tabs.sendMessage(id, { type: "stage-hide" }), tabId);
  check("fechar palco", (await page.evaluate(() => !document.querySelector("omnia-inspect-stage"))));
  server.close();
} finally {
  await context.close();
  fs.rmSync(userDir, { recursive: true, force: true });
}

console.log(failures ? `\n${failures} verificação(ões) falharam` : "\nTudo certo ✔");
process.exit(failures ? 1 : 0);
