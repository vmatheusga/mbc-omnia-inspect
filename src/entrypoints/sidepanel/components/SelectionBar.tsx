import { Columns3, X } from "lucide-react";
import type { Inspector } from "../useInspector";
import { KIND_META, cx } from "./ui";

const DOT = {
  omnia: "bg-brand",
  shadcn: "bg-info",
  react: "bg-success",
  native: "bg-muted-foreground",
};

/** Faixa com os elementos selecionados (Shift+clique). */
export function SelectionBar({
  inspector,
  comparing,
  onToggleCompare,
}: {
  inspector: Inspector;
  comparing: boolean;
  onToggleCompare: () => void;
}) {
  const { results, result } = inspector;
  return (
    <div className="flex flex-col gap-2 rounded-md border border-border bg-card p-2">
      <div className="flex items-center justify-between gap-2 px-0.5">
        <span className="text-2xs font-semibold tracking-wide text-muted-foreground uppercase">
          Seleção · {results.length}
        </span>
        <button
          type="button"
          onClick={onToggleCompare}
          className={cx(
            "flex h-6 items-center gap-1 rounded-xs px-2 text-2xs font-medium transition-colors",
            comparing ? "bg-info text-info-foreground" : "bg-muted text-foreground hover:bg-accent",
          )}
        >
          <Columns3 className="size-3" />
          {comparing ? "Ver detalhes" : "Comparar"}
        </button>
      </div>
      <div className="flex flex-wrap gap-1">
        {results.map((r) => {
          const active = !comparing && r.element.id === result?.element.id;
          const variants = r.component.variants.filter((v) => !v.isDefault).map((v) => v.value);
          return (
            <span
              key={r.element.id}
              className={cx(
                "group flex max-w-full items-center gap-1 rounded-sm border py-0.5 pr-0.5 pl-1.5 text-2xs",
                active ? "border-info bg-info-subtle text-info-subtle-foreground" : "border-border bg-background",
              )}
              onMouseEnter={() => inspector.highlight(r.element.id)}
              onMouseLeave={() => inspector.highlight(null)}
            >
              <button
                type="button"
                title={`${KIND_META[r.component.kind].label} — ver detalhes`}
                onClick={() => {
                  inspector.setPrimary(r.element.id);
                  if (comparing) onToggleCompare();
                }}
                className="flex min-w-0 items-center gap-1"
              >
                <span className={cx("size-1.5 shrink-0 rounded-full", DOT[r.component.kind])} />
                <span className="truncate font-medium">{r.component.name}</span>
                {variants.length > 0 && <span className="truncate opacity-70">{variants.join(" · ")}</span>}
              </button>
              <button
                type="button"
                title="Remover da seleção"
                onClick={() => inspector.deselect(r.element.id)}
                className="flex size-4 shrink-0 items-center justify-center rounded-xs opacity-50 hover:bg-accent hover:opacity-100"
              >
                <X className="size-3" />
              </button>
            </span>
          );
        })}
      </div>
    </div>
  );
}
