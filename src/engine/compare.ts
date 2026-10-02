import { formatColorAs } from "./color";
import type { PropertySection, Value } from "./properties";
import type { InspectionResult } from "./types";

export interface ComparisonCell {
  display: string;
  token?: string;
}

export interface ComparisonRow {
  group: string;
  label: string;
  values: ComparisonCell[];
  same: boolean;
}

const fmt = (n: number) => `${Math.round(n * 100) / 100}px`;

function valueText(value: Value): string {
  return value
    .map((p) => (typeof p === "string" ? p : "px" in p ? fmt(p.px) : formatColorAs(p.color, "hex")))
    .join("");
}

function row(sections: PropertySection[], id: string, label: string) {
  const r = sections.find((s) => s.id === id)?.rows.find((x) => x.label === label);
  return r ? { display: valueText(r.value), token: r.token } : { display: "—" };
}

type Getter = (r: InspectionResult) => ComparisonCell;

const ROWS: Array<[string, string, Getter]> = [
  [
    "Componente",
    "Componente",
    (r) => ({
      display: [r.component.name, ...r.component.variants.filter((v) => !v.isDefault).map((v) => v.value)].join(" · "),
      token: r.component.designSystem,
    }),
  ],
  ["Layout", "Fluxo", (r) => row(r.properties, "layout", "Fluxo")],
  ["Layout", "Largura", (r) => row(r.properties, "layout", "Largura")],
  ["Layout", "Altura", (r) => row(r.properties, "layout", "Altura")],
  ["Layout", "Padding", (r) => row(r.properties, "layout", "Padding")],
  ["Layout", "Espaço", (r) => row(r.properties, "layout", "Espaço")],
  ["Layout", "Margem", (r) => row(r.properties, "layout", "Margem")],
  ["Aparência", "Raio", (r) => row(r.properties, "aparencia", "Raio")],
  ["Aparência", "Borda", (r) => row(r.properties, "aparencia", "Borda")],
  ["Aparência", "Sombra", (r) => row(r.properties, "aparencia", "Sombra")],
  ["Tipografia", "Família", (r) => row(r.properties, "tipografia", "Família")],
  ["Tipografia", "Tamanho", (r) => row(r.properties, "tipografia", "Tamanho")],
  ["Tipografia", "Peso", (r) => row(r.properties, "tipografia", "Peso")],
  ["Tipografia", "Altura de linha", (r) => row(r.properties, "tipografia", "Altura de linha")],
  ["Cores", "Texto", (r) => row(r.properties, "cores", "Texto")],
  ["Cores", "Fundo", (r) => row(r.properties, "cores", "Fundo")],
  ["Cores", "Borda", (r) => row(r.properties, "cores", "Borda")],
];

/** Compara os elementos selecionados propriedade a propriedade. */
export function compareResults(results: InspectionResult[]): ComparisonRow[] {
  return ROWS.map(([group, label, get]) => {
    const values = results.map(get);
    // diferenças de subpixel (71.57px × 71.66px) não contam
    const key = (v: ComparisonCell) => v.display.replace(/(\d+\.\d+)px/g, (m) => `${Math.round(parseFloat(m))}px`);
    const same = values.every((v) => key(v) === key(values[0]));
    return { group, label, values, same };
  }).filter((r) => r.values.some((v) => v.display !== "—"));
}
