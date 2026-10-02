import type { ReactNode } from "react";
import type { BoxModel, BoxSides } from "../../../engine/types";
import { cx, useCopy } from "./ui";

type Kind = "margin" | "border" | "padding";

const BADGE: Record<Kind, string> = {
  margin: "bg-brand text-brand-foreground",
  border: "bg-foreground text-background",
  padding: "bg-info text-info-foreground",
};

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, ""));

function Value({
  kind,
  side,
  value,
  hint,
  className,
}: {
  kind: Kind;
  side: keyof BoxSides;
  value: number;
  hint?: string;
  className?: string;
}) {
  const { copied, copy } = useCopy();
  if (!value) return <span className={cx("text-xs text-muted-foreground", className)}>-</span>;
  const cls = hint?.split(" · ")[0];
  const copyable = cls && !cls.startsWith("--") && !cls.startsWith("fora");
  return (
    <button
      type="button"
      title={`${kind}-${side}: ${fmt(value)}px${hint ? `\n${hint}` : ""}${copyable ? "\nClique para copiar a classe" : ""}`}
      onClick={() => copyable && copy(cls!)}
      className={cx(
        "min-w-5 rounded-xs px-1 text-center font-mono text-2xs leading-4 font-semibold tabular-nums",
        copied ? "bg-success text-success-foreground" : BADGE[kind],
        !hint?.includes("--spacing") && kind !== "border" && "ring-2 ring-warning",
        className,
      )}
    >
      {copied ? "✓" : fmt(value)}
    </button>
  );
}

function Layer({
  kind,
  label,
  sides,
  hints,
  className,
  children,
}: {
  kind: Kind;
  label: string;
  sides: BoxSides;
  hints: Record<string, string>;
  className?: string;
  children: ReactNode;
}) {
  const hint = (side: keyof BoxSides) => hints[kind === "border" ? `border-${side}` : `${kind}-${side}`];
  return (
    <div
      className={cx(
        "relative grid grid-cols-[minmax(24px,auto)_1fr_minmax(24px,auto)] grid-rows-[22px_1fr_22px] items-center rounded-sm",
        className,
      )}
    >
      <span className="absolute top-1 left-2 text-2xs text-muted-foreground">{label}</span>
      <Value kind={kind} side="top" value={sides.top} hint={hint("top")} className="col-start-2 row-start-1 justify-self-center" />
      <Value kind={kind} side="left" value={sides.left} hint={hint("left")} className="col-start-1 row-start-2 justify-self-center" />
      <div className="col-start-2 row-start-2 min-w-0">{children}</div>
      <Value kind={kind} side="right" value={sides.right} hint={hint("right")} className="col-start-3 row-start-2 justify-self-center" />
      <Value kind={kind} side="bottom" value={sides.bottom} hint={hint("bottom")} className="col-start-2 row-start-3 justify-self-center" />
    </div>
  );
}

/** Anatomia da camada: margin → border → padding → conteúdo (como no Figma Dev Mode). */
export function BoxModelView({ box }: { box: BoxModel }) {
  const { copied, copy } = useCopy();
  const size = `${fmt(box.content.width)} × ${fmt(box.content.height)}`;
  return (
    <div className="flex flex-col gap-2 rounded-md bg-muted p-2.5">
      <Layer kind="margin" label="Margin" sides={box.margin} hints={box.hints} className="border border-dashed border-muted-foreground/40">
        <Layer kind="border" label="Border" sides={box.border} hints={box.hints} className="border border-border bg-background">
          <Layer
            kind="padding"
            label="Padding"
            sides={box.padding}
            hints={box.hints}
            className="border border-foreground/70 bg-info-subtle"
          >
            <button
              type="button"
              onClick={() => copy(`${fmt(box.content.width)}×${fmt(box.content.height)}`)}
              title={`Conteúdo (sem padding e borda). Caixa inteira: ${fmt(box.size.width)} × ${fmt(box.size.height)}`}
              className="mx-auto my-1 flex min-h-8 w-full max-w-32 items-center justify-center rounded-xs border border-dashed border-foreground/60 bg-background px-2 font-mono text-xs font-medium tabular-nums"
            >
              {copied ? "copiado" : size}
            </button>
          </Layer>
        </Layer>
      </Layer>
      <div className="flex items-center gap-1.5 text-2xs text-muted-foreground">
        {box.display && <span className="rounded-xs bg-background px-1.5 py-px font-mono">{box.display}</span>}
        {box.position && box.position !== "static" && (
          <span className="rounded-xs bg-background px-1.5 py-px font-mono">{box.position}</span>
        )}
        <span className="font-mono">
          caixa {fmt(box.size.width)} × {fmt(box.size.height)}
        </span>
        <span className="ml-auto">{box.boxSizing}</span>
      </div>
    </div>
  );
}
