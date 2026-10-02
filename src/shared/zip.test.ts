import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { formatFromUrl, nameFromUrl, slugify } from "./assets";
import { createZip } from "./zip";

describe("zip", () => {
  it("creates an archive readable by unzip", async () => {
    const enc = new TextEncoder();
    const blob = createZip([
      { path: "svg/icone-busca.svg", data: enc.encode("<svg/>") },
      { path: "imagens/foto.png", data: new Uint8Array([1, 2, 3]) },
    ]);
    const file = path.join(os.tmpdir(), `omnia-zip-${Date.now()}.zip`);
    fs.writeFileSync(file, Buffer.from(await blob.arrayBuffer()));
    const listing = execFileSync("unzip", ["-l", file]).toString();
    expect(listing).toContain("svg/icone-busca.svg");
    expect(listing).toContain("imagens/foto.png");
    execFileSync("unzip", ["-t", file]);
    fs.rmSync(file);
  });
});

describe("assets helpers", () => {
  it("detects formats and names", () => {
    expect(formatFromUrl("https://x.com/a/logo.PNG?v=2")).toBe("png");
    expect(formatFromUrl("/_next/image?url=%2Fimg%2Fhero.jpeg&w=1080&q=75")).toBe("jpg");
    expect(formatFromUrl("https://cdn.com/p?fm=webp")).toBe("webp");
    expect(formatFromUrl("data:image/svg+xml;base64,AAA")).toBe("svg");
    expect(formatFromUrl("https://x.com/imagem")).toBe("?");
    expect(nameFromUrl("https://x.com/static/logo-mbc.3f9a2c1b.png")).toBe("logo-mbc");
    expect(slugify("Bíblia de Jerusalém — Capa")).toBe("biblia-de-jerusalem-capa");
  });
});
