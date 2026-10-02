import { interpretClass, isBaseState } from "./tailwind";
import type { TokenIndex } from "./knowledge";
import { spacingStep } from "./tokens";
import type { BoxModel, BoxSides, ElementSnapshot } from "./types";

const SIDES = ["top", "right", "bottom", "left"] as const;

const round = (n: number) => Math.round(n * 100) / 100;

function sides(styles: Record<string, string>, prop: (side: string) => string): BoxSides {
  const out = {} as BoxSides;
  for (const side of SIDES) out[side] = round(parseFloat(styles[prop(side)] ?? "") || 0);
  return out;
}

const fmtStep = (n: number) => (Number.isInteger(n) ? String(n) : String(round(n)));

/** Anatomia da caixa (margin → border → padding → conteúdo), como no Figma Dev Mode. */
export function buildBoxModel(el: ElementSnapshot, index: TokenIndex, viewportWidth: number): BoxModel {
  const s = el.styles;
  const margin = sides(s, (side) => `margin-${side}`);
  const border = sides(s, (side) => `border-${side}-width`);
  const padding = sides(s, (side) => `padding-${side}`);
  const width = round(el.rect.width);
  const height = round(el.rect.height);

  // Classe responsável por cada lado (a de breakpoint ativo mais largo vence)
  const hints: Record<string, string> = {};
  const meanings = el.classes
    .map((c) => interpretClass(c, index))
    .filter((m) => m && m.kind === "spacing" && isBaseState(m.cls, index.theme, viewportWidth));
  for (const m of meanings) {
    for (const prop of m!.affects) hints[prop] = m!.cls.raw;
  }
  for (const [kind, box] of [["margin", margin], ["padding", padding]] as const) {
    for (const side of SIDES) {
      const value = box[side];
      const key = `${kind}-${side}`;
      if (!value) continue;
      const { onScale, step } = spacingStep(Math.abs(value));
      const token = onScale ? `--spacing × ${fmtStep(step)}` : "fora da escala de 4px";
      hints[key] = hints[key] ? `${hints[key]} · ${token}` : token;
    }
  }
  for (const side of SIDES) {
    if (border[side]) hints[`border-${side}`] = `${border[side]}px ${s[`border-${side}-color`] ?? ""}`.trim();
  }

  return {
    margin,
    border,
    padding,
    size: { width, height },
    content: {
      width: round(Math.max(0, width - border.left - border.right - padding.left - padding.right)),
      height: round(Math.max(0, height - border.top - border.bottom - padding.top - padding.bottom)),
    },
    boxSizing: s["box-sizing"] || "content-box",
    display: s.display || "",
    position: s.position || "",
    hints,
  };
}
