import { Check, ClipboardCopy } from "lucide-react";
import { Fragment, useState } from "react";
import { formatColorAs, type ColorFormat } from "../../../engine/color";
import type { CssDecl, PropertyRow, PropertySection, Value } from "../../../engine/properties";
import type { TokenUsage } from "../../../engine/types";
import { Mono, Swatch, cx, useCopy } from "./ui";

type Mode = "lista" | "codigo";
type Unit = "px" | "rem";
type CodeFormat = "css" | "css-tokens" | "tailwind";

interface Prefs {
  mode: Mode;
  unit: Unit;
  color: ColorFormat;
  code: CodeFormat;
}

const DEFAULT_PREFS: Prefs = { mode: "lista", unit: "px", color: "hex", code: "css" };
const STORAGE_KEY = "omnia-inspect:properties";

function loadPrefs(): Prefs {
  try {
    return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") };
  } catch {
    return DEFAULT_PREFS;
  }
}

function usePrefs() {
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const update = (patch: Partial<Prefs>) =>
    setPrefs((p) => {
      const next = { ...p, ...patch };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* sem storage */
      }
      return next;
    });
  return [prefs, update] as const;
}

const round = (n: number, digits = 4) => {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
};

function formatValue(value: Value, prefs: Prefs): string {
  return value
    .map((part) => {
      if (typeof part === "string") return part;
      if ("px" in part) {
        if (part.px === 0) return "0";
        return prefs.unit === "rem" ? `${round(part.px / 16)}rem` : `${round(part.px, 2)}px`;
      }
      return formatColorAs(part.color, prefs.color);
    })
    .join("");
}

const SOURCE_DOT: Record<TokenUsage["source"], string> = {
  classe: "bg-success",
  valor: "bg-info",
  escala: "bg-info",
  herdado: "bg-muted-foreground",
  "fora do padrão": "bg-warning",
};

function Select<T extends string>({
  value,
  onChange,
  options,
  title,
}: {
  value: T;
  onChange: (v: T) => void;
  options: Array<[T, string]>;
  title: string;
}) {
  return (
    <select
      title={title}
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      className="h-7 rounded-sm border border-input bg-background px-1.5 text-xs"
    >
      {options.map(([v, label]) => (
        <option key={v} value={v}>
          {label}
        </option>
      ))}
    </select>
  );
}

function ListRow({ row, prefs }: { row: PropertyRow; prefs: Prefs }) {
  const { copied, copy } = useCopy();
  const text = formatValue(row.value, prefs);
  return (
    <button
      type="button"
      onClick={() => copy(row.token?.startsWith("--") ? `var(${row.token})` : text)}
      title={row.token ? `Clique para copiar var(${row.token})` : "Clique para copiar o valor"}
      className="grid w-full grid-cols-[104px_1fr] items-start gap-2 rounded-xs px-1.5 py-1 text-left hover:bg-accent"
    >
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {row.source && <span className={cx("size-1.5 shrink-0 rounded-full", SOURCE_DOT[row.source])} />}
        {row.label}
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="flex min-w-0 items-center gap-1.5 text-xs text-foreground">
          {row.swatch && <Swatch color={row.swatch} />}
          <span className={cx("break-words", row.source === "fora do padrão" && "text-warning-subtle-foreground")}>{text}</span>
          {copied && <Check className="size-3 shrink-0 text-success" />}
        </span>
        {(row.token || row.utility) && (
          <span className="flex flex-wrap items-center gap-1 text-2xs text-muted-foreground">
            {row.token && <Mono className="text-[10px]">{row.token}</Mono>}
            {row.utility && <span className="font-mono">{row.utility}</span>}
          </span>
        )}
      </span>
    </button>
  );
}

function declText(d: CssDecl, prefs: Prefs) {
  const value = prefs.code === "css-tokens" && d.token ? d.token : formatValue(d.value, prefs);
  return `${d.prop}: ${value};`;
}

function CodeBlock({ section, prefs }: { section: PropertySection; prefs: Prefs }) {
  const { copied, copy } = useCopy();
  const tailwind = prefs.code === "tailwind";
  const lines = tailwind ? section.tailwind : section.css.map((d) => declText(d, prefs));
  if (!lines.length) {
    return <p className="px-1.5 text-2xs text-muted-foreground">{tailwind ? "Nenhuma classe desta seção." : "Nada a declarar."}</p>;
  }
  const copyText = tailwind ? section.tailwind.join(" ") : lines.join("\n");
  return (
    <div className="relative overflow-hidden rounded-sm border border-border">
      <button
        type="button"
        onClick={() => copy(copyText)}
        title="Copiar"
        className="absolute top-1.5 right-1.5 flex size-6 items-center justify-center rounded-xs bg-background text-muted-foreground hover:text-foreground"
      >
        {copied ? <Check className="size-3.5 text-success" /> : <ClipboardCopy className="size-3.5" />}
      </button>
      <div className="grid grid-cols-[auto_1fr] overflow-x-auto font-mono text-[11px] leading-5">
        {lines.map((line, i) => {
          const decl = section.css[i];
          return (
            <Fragment key={i}>
              <span className="border-r border-border bg-muted px-2 text-right text-muted-foreground select-none">{i + 1}</span>
              <span className="pr-8 pl-3 whitespace-pre">
                {tailwind ? (
                  <span className="text-brand-subtle-foreground">{line}</span>
                ) : (
                  <>
                    <span className="text-foreground">{decl.prop}</span>
                    <span className="text-muted-foreground">: </span>
                    <span
                      className={cx(
                        "text-brand-subtle-foreground",
                        prefs.code === "css" && decl.token && "underline decoration-dashed decoration-1 underline-offset-4",
                      )}
                      title={decl.token}
                    >
                      {prefs.code === "css-tokens" && decl.token ? decl.token : formatValue(decl.value, prefs)}
                    </span>
                    <span className="text-muted-foreground">;</span>
                  </>
                )}
              </span>
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}

export function PropertiesView({ sections }: { sections: PropertySection[] }) {
  const [prefs, update] = usePrefs();
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <div role="tablist" className="flex gap-0.5 rounded-sm bg-muted p-0.5">
          {(["lista", "codigo"] as const).map((mode) => (
            <button
              key={mode}
              role="tab"
              type="button"
              aria-selected={prefs.mode === mode}
              onClick={() => update({ mode })}
              className={cx(
                "h-7 rounded-xs px-3 text-xs font-medium",
                prefs.mode === mode ? "bg-background shadow-xs" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {mode === "lista" ? "Lista" : "Código"}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          {prefs.mode === "codigo" && (
            <Select<CodeFormat>
              title="Formato do código"
              value={prefs.code}
              onChange={(code) => update({ code })}
              options={[
                ["css", "CSS"],
                ["css-tokens", "CSS + tokens"],
                ["tailwind", "Tailwind"],
              ]}
            />
          )}
          {!(prefs.mode === "codigo" && prefs.code !== "css") && (
            <Select<Unit>
              title="Unidade"
              value={prefs.unit}
              onChange={(unit) => update({ unit })}
              options={[
                ["px", "px"],
                ["rem", "rem"],
              ]}
            />
          )}
        </div>
      </div>

      {sections.map((section) => (
        <section key={section.id} className="flex flex-col gap-1.5">
          <header className="flex h-7 items-center justify-between">
            <h3 className="text-sm font-medium">{section.title}</h3>
            {section.id === "cores" && (prefs.mode === "lista" || prefs.code === "css") && (
              <Select<ColorFormat>
                title="Formato de cor"
                value={prefs.color}
                onChange={(color) => update({ color })}
                options={[
                  ["hex", "Hex"],
                  ["rgb", "RGB"],
                  ["hsl", "HSL"],
                ]}
              />
            )}
          </header>
          {prefs.mode === "lista" || section.listOnly ? (
            <div className="-mx-1.5 flex flex-col">
              {section.rows.length ? (
                section.rows.map((row, i) => <ListRow key={`${row.label}-${i}`} row={row} prefs={prefs} />)
              ) : (
                <p className="px-1.5 text-2xs text-muted-foreground">Sem valores.</p>
              )}
            </div>
          ) : (
            <CodeBlock section={section} prefs={prefs} />
          )}
        </section>
      ))}
    </div>
  );
}
