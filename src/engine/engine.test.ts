import { describe, expect, it } from "vitest";
import { knowledge, knowledgeIndex } from "../knowledge";
import { analyze } from "./analyze";
import { contrastRatio, parseColor } from "./color";
import { buildTokenIndex } from "./knowledge";
import { interpretClass } from "./tailwind";
import type { ElementSnapshot, InspectInput, PageContext } from "./types";

const omniaPage: PageContext = {
  url: "http://localhost:3000",
  theme: "light",
  rootFontSize: 16,
  tokenValues: {
    "--background": "#ffffff",
    "--body-background": "#f8f9fa",
    "--foreground-alt": "#687076",
    "--brand": "#ff4d4d",
    "--input-background": "#ffffff",
  },
};

const plainPage: PageContext = { ...omniaPage, tokenValues: {} };

let seq = 0;
function snapshot(partial: Partial<ElementSnapshot> & { classes?: string[] }): ElementSnapshot {
  return {
    id: String(++seq),
    tag: "div",
    classes: [],
    attrs: {},
    styles: {},
    rect: { x: 0, y: 0, width: 100, height: 36 },
    effectiveBackground: "rgb(255, 255, 255)",
    hasDirectText: false,
    focusable: false,
    cursorPointer: false,
    childElementCount: 0,
    ...partial,
  };
}

function run(el: ElementSnapshot, page = omniaPage) {
  const input: InspectInput = { element: el, ancestors: [], children: [], page };
  return analyze(input, knowledgeIndex);
}

const omniaButtonClasses = (variant: string, size: string) => {
  const config = knowledge.omnia.variantConfigs.buttonVariants;
  return [...config.base, ...config.variants.variant[variant], ...config.variants.size[size]];
};

describe("color", () => {
  it("parses hex, rgb, oklab and computes contrast", () => {
    expect(parseColor("#ff4d4d")).toMatchObject({ r: 255, g: 77, b: 77, a: 1 });
    expect(parseColor("rgba(0, 0, 0, 0.5)")).toMatchObject({ a: 0.5 });
    expect(parseColor("rgb(0 0 0 / 10%)")?.a).toBeCloseTo(0.1);
    const ok = parseColor("oklab(0.628 0.2249 0.1258)")!;
    expect(ok.r).toBeGreaterThan(230);
    expect(contrastRatio(parseColor("#000")!, parseColor("#fff")!)).toBeCloseTo(21, 0);
  });
});

describe("tailwind", () => {
  const index = buildTokenIndex(knowledge, omniaPage);
  it("maps utilities to tokens", () => {
    expect(interpretClass("bg-primary/90", index)).toMatchObject({ token: "--primary", alpha: 0.9, property: "background-color" });
    expect(interpretClass("hover:text-brand-foreground", index)).toMatchObject({ token: "--brand-foreground" });
    expect(interpretClass("rounded-md", index)).toMatchObject({ token: "--radius-md", px: 12 });
    expect(interpretClass("text-sm", index)).toMatchObject({ kind: "font-size", token: "--text-sm" });
    expect(interpretClass("px-4", index)).toMatchObject({ kind: "spacing", px: 16 });
    expect(interpretClass("bg-red-500", index)).toMatchObject({ tailwindPalette: true });
    expect(interpretClass("p-[13px]", index)).toMatchObject({ arbitrary: "13px", px: 13 });
    expect(interpretClass("border-2", index)).toBeNull();
  });
});

describe("identify", () => {
  it("recognizes an Omnia Button with brand/sm variants", () => {
    const res = run(
      snapshot({
        tag: "button",
        slot: "button",
        attrs: { "data-slot": "button" },
        classes: omniaButtonClasses("brand", "sm"),
        text: "Salvar",
        hasDirectText: true,
        focusable: true,
        accessibleName: "Salvar",
        styles: {
          color: "rgb(251, 252, 253)",
          "background-color": "rgb(255, 77, 77)",
          "font-size": "14px",
          "font-weight": "500",
          "font-family": "Inter, ui-sans-serif",
          "border-top-left-radius": "12px",
          "border-top-right-radius": "12px",
          "border-bottom-right-radius": "12px",
          "border-bottom-left-radius": "12px",
          "padding-left": "12px",
          "padding-right": "12px",
        },
      }),
    );
    expect(res.component.kind).toBe("omnia");
    expect(res.component.name).toBe("Button");
    const variant = Object.fromEntries(res.component.variants.map((v) => [v.dimension, v.value]));
    expect(variant).toEqual({ variant: "brand", size: "sm" });
    expect(res.code.jsx).toBe('<Button variant="brand" size="sm">Salvar</Button>');
    expect(res.code.importLine).toContain("@omnia-ds/ui");
    const bg = res.tokens.find((t) => t.property === "background-color");
    expect(bg).toMatchObject({ token: "--brand", source: "classe" });
    expect(res.tokens.find((t) => t.property === "border-radius")?.token).toBe("--radius-md");
  });

  it("distinguishes ghost from outline", () => {
    const ghost = run(snapshot({ tag: "button", slot: "button", classes: omniaButtonClasses("ghost", "default") }));
    const outline = run(snapshot({ tag: "button", slot: "button", classes: omniaButtonClasses("outline", "icon") }));
    expect(ghost.component.variants.find((v) => v.dimension === "variant")?.value).toBe("ghost");
    expect(outline.component.variants.map((v) => v.value)).toEqual(["outline", "icon"]);
  });

  it("uses React props when available", () => {
    const res = run(
      snapshot({
        tag: "button",
        slot: "button",
        classes: ["h-12"],
        react: { name: "Button", props: { variant: "destructive", size: "lg" } },
      }),
    );
    expect(res.component.variants.every((v) => v.source === "react")).toBe(true);
    expect(res.component.variants.map((v) => v.value)).toEqual(["destructive", "lg"]);
  });

  it("recognizes a shadcn base-nova button (not Omnia)", () => {
    const baseNova = knowledge.shadcn.find((s) => s.id === "shadcn-base-nova")!;
    const config = baseNova.variantConfigs.buttonVariants;
    const classes = [...config.base, ...Object.values(config.variants.variant)[0], ...Object.values(config.variants.size)[0]];
    const res = run(snapshot({ tag: "button", slot: "button", classes }), plainPage);
    expect(res.component.kind).toBe("shadcn");
    expect(res.component.designSystem).toContain("base-nova");
  });

  it("recognizes Omnia Card parts via data-slot", () => {
    const res = run(snapshot({ slot: "card-header", classes: knowledge.omnia.slots["card-header"].baseClasses }));
    expect(res.component).toMatchObject({ kind: "omnia", name: "CardHeader", family: "Card" });
  });

  it("falls back to class signature without data-slot (shadcn v3)", () => {
    const newYork = knowledge.shadcn.find((s) => s.id === "shadcn-new-york")!;
    const card = newYork.signatures.find((s) => s.part === "Card")!;
    const res = run(snapshot({ classes: [...card.baseClasses, "p-6"] }), plainPage);
    expect(res.component.name).toBe("Card");
    expect(res.component.kind).toBe("shadcn");
  });

  it("does not match generic layout divs to component signatures", () => {
    const res = run(snapshot({ classes: ["flex", "items-center", "justify-between", "gap-2", "border-b", "border-border", "px-3", "py-2"] }));
    expect(res.component.kind).toBe("native");
  });

  it("ignores non-color bg-* utilities", () => {
    const res = run(snapshot({ tag: "span", classes: ["bg-clip-padding", "bg-cover"] }));
    expect(res.findings.some((f) => f.title.includes("bg-clip-padding"))).toBe(false);
  });

  it("labels native elements and lucide icons", () => {
    expect(run(snapshot({ tag: "svg", classes: ["lucide", "lucide-chevron-down", "size-4"] })).component.name).toBe(
      "Ícone ChevronDown",
    );
    const native = run(snapshot({ tag: "button", classes: ["px-3"] }));
    expect(native.component.kind).toBe("native");
    expect(native.findings.some((f) => f.category === "componente" && f.title.includes("Button"))).toBe(true);
  });
});

describe("audit", () => {
  it("flags hardcoded near-token colors and suggests the token", () => {
    const res = run(
      snapshot({
        classes: ["bg-[#ff4e4e]", "p-[13px]"],
        styles: { "background-color": "rgb(255, 78, 78)", "padding-top": "13px", "padding-right": "13px", "padding-bottom": "13px", "padding-left": "13px" },
      }),
    );
    const arbitrary = res.findings.find((f) => f.title.includes("bg-[#ff4e4e]"));
    expect(arbitrary?.suggestion).toContain("bg-brand");
    expect(res.findings.some((f) => f.title.includes("p-[13px]"))).toBe(true);
  });

  it("flags Tailwind default palette and inline styles", () => {
    const res = run(
      snapshot({
        classes: ["bg-red-500"],
        inlineStyle: "color: #333; padding: 7px",
        styles: { "background-color": "oklch(63.7% 0.237 25.331)", color: "rgb(51, 51, 51)" },
      }),
    );
    expect(res.findings.some((f) => f.title.includes("paleta padrão"))).toBe(true);
    expect(res.findings.some((f) => f.category === "inline")).toBe(true);
    expect(res.findings.some((f) => f.title.startsWith("Texto"))).toBe(true);
  });

  it("detects off-scale spacing and radius", () => {
    const res = run(
      snapshot({
        styles: {
          "padding-top": "10px",
          "padding-bottom": "10px",
          "padding-left": "13px",
          "padding-right": "13px",
          "border-top-left-radius": "7px",
          "border-top-right-radius": "7px",
          "border-bottom-right-radius": "7px",
          "border-bottom-left-radius": "7px",
        },
      }),
    );
    expect(res.findings.some((f) => f.title.startsWith("Padding"))).toBe(true);
    expect(res.findings.some((f) => f.title.startsWith("Raio"))).toBe(true);
  });

  it("reports contrast failures and unnamed interactive elements", () => {
    const res = run(
      snapshot({
        tag: "button",
        hasDirectText: true,
        styles: { color: "rgb(200, 200, 200)", "font-size": "14px" },
        effectiveBackground: "rgb(255, 255, 255)",
      }),
    );
    expect(res.a11y.contrast?.aa).toBe(false);
    expect(res.findings.some((f) => f.title.startsWith("Contraste"))).toBe(true);
    expect(res.findings.some((f) => f.title.includes("nome acessível"))).toBe(true);
  });

  it("resolves dark theme token values", () => {
    const dark = { ...omniaPage, theme: "dark" as const, tokenValues: { ...omniaPage.tokenValues, "--background": "" } };
    const res = run(snapshot({ styles: { "background-color": "rgb(26, 29, 30)" } }), dark);
    expect(res.tokens.find((t) => t.property === "background-color")?.token).toBe("--background");
  });
});

describe("responsive", () => {
  it("activates breakpoint classes by viewport width", () => {
    const el = snapshot({
      classes: ["p-2", "md:p-6", "lg:hidden", "max-sm:text-xs"],
      styles: { "padding-top": "24px", "padding-right": "24px", "padding-bottom": "24px", "padding-left": "24px" },
    });
    const wide = run(el, { ...omniaPage, viewportWidth: 900 });
    expect(wide.page.breakpoint).toBe("md");
    expect(wide.responsive.map((r) => [r.breakpoint, r.active])).toEqual([
      ["max-sm", false],
      ["md", true],
      ["lg", false],
    ]);
    expect(wide.tokens.find((t) => t.property === "padding")?.utility).toContain("md:p-6");
    const narrow = run(el, { ...omniaPage, viewportWidth: 375 });
    expect(narrow.page.breakpoint).toBe("base");
    expect(narrow.responsive.find((r) => r.breakpoint === "max-sm")?.active).toBe(true);
  });
});

describe("box model", () => {
  it("computes margin, border, padding and content", () => {
    const res = run(
      snapshot({
        classes: ["p-4", "md:px-6", "mt-2", "border"],
        rect: { x: 0, y: 0, width: 370, height: 356 },
        styles: {
          "margin-top": "8px",
          "padding-top": "16px",
          "padding-bottom": "16px",
          "padding-left": "24px",
          "padding-right": "24px",
          "border-top-width": "1px",
          "border-right-width": "1px",
          "border-bottom-width": "1px",
          "border-left-width": "1px",
          "box-sizing": "border-box",
        },
      }),
      { ...omniaPage, viewportWidth: 1024 },
    );
    const box = res.boxModel;
    expect(box.margin).toEqual({ top: 8, right: 0, bottom: 0, left: 0 });
    expect(box.content).toEqual({ width: 370 - 2 - 48, height: 356 - 2 - 32 });
    expect(box.hints["padding-left"]).toBe("md:px-6 · --spacing × 6");
    expect(box.hints["padding-top"]).toBe("p-4 · --spacing × 4");
    expect(box.hints["margin-top"]).toBe("mt-2 · --spacing × 2");
    expect(box.boxSizing).toBe("border-box");
  });
});

describe("properties", () => {
  it("describes layout like Figma (flow, fill/hug/fixed, gap)", () => {
    const res = run(
      snapshot({
        classes: ["flex", "flex-col", "gap-4", "w-full", "p-4"],
        rect: { x: 0, y: 0, width: 338, height: 323.58 },
        styles: {
          display: "flex",
          "flex-direction": "column",
          "row-gap": "16px",
          "column-gap": "16px",
          "padding-top": "16px",
          "padding-right": "16px",
          "padding-bottom": "16px",
          "padding-left": "16px",
          color: "rgb(17, 24, 28)",
        },
        parentStyles: { display: "block", "content-width": "338", "content-height": "900" },
      }),
    );
    const layout = res.properties.find((s) => s.id === "layout")!;
    const row = (label: string) => layout.rows.find((r) => r.label === label)?.value;
    expect(row("Fluxo")).toEqual(["Vertical"]);
    expect(row("Largura")).toEqual(["Preenchimento (", { px: 338 }, ")"]);
    expect(row("Altura")).toEqual(["Envolver (", { px: 323.58 }, ")"]);
    expect(row("Espaço")).toEqual([{ px: 16 }]);
    expect(layout.css.find((d) => d.prop === "gap")?.token).toBe("calc(var(--spacing) * 4)");
    expect(layout.tailwind).toEqual(["flex", "flex-col", "gap-4", "w-full", "p-4"]);
    const cores = res.properties.find((s) => s.id === "cores")!;
    expect(cores.css[0]).toMatchObject({ prop: "color", token: "var(--foreground)" });
  });
});

describe("compare", () => {
  it("marks equal and different properties", async () => {
    const { compareResults } = await import("./compare");
    const config = knowledge.omnia.variantConfigs.buttonVariants;
    const make = (variant: string, size: string, px: number) =>
      run(
        snapshot({
          tag: "button",
          slot: "button",
          classes: [...config.base, ...config.variants.variant[variant], ...config.variants.size[size]],
          styles: { "padding-left": `${px}px`, "padding-right": `${px}px`, "border-top-left-radius": "12px", "border-top-right-radius": "12px", "border-bottom-right-radius": "12px", "border-bottom-left-radius": "12px" },
        }),
      );
    const rows = compareResults([make("brand", "sm", 12), make("brand", "lg", 24)]);
    const byLabel = Object.fromEntries(rows.map((r) => [r.label, r]));
    expect(byLabel.Componente.same).toBe(false);
    expect(byLabel.Padding.same).toBe(false);
    expect(byLabel.Raio.same).toBe(true);
  });
});
