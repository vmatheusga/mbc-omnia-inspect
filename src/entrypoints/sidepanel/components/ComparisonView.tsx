import { useMemo, useState } from "react";
import { compareResults } from "../../../engine/compare";
import type { InspectionResult } from "../../../engine/types";
import type { Inspector } from "../useInspector";
import { cx } from "./ui";

/** Tabela comparando os elementos selecionados (iguais × diferentes). */
export function ComparisonView({ results, inspector }: { results: InspectionResult[]; inspector: Inspector }) {
  const [onlyDiff, setOnlyDiff] = useState(true);
  const rows = useMemo(() => compareResults(results), [results]);
  const visible = onlyDiff ? rows.filter((r) => !r.same) : rows;
  const diffCount = rows.filter((r) => !r.same).length;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-foreground-alt">
          {diffCount === 0 ? (
            "Todas as propriedades comparadas são iguais."
          ) : (
            <>
              <b className="text-warning-subtle-foreground">{diffCount}</b> propriedade{diffCount > 1 ? "s" : ""} diferente
              {diffCount > 1 ? "s" : ""} entre {results.length} elementos
            </>
          )}
        </p>
        <label className="flex shrink-0 items-center gap-1.5 text-2xs text-muted-foreground">
          <input type="checkbox" checked={onlyDiff} onChange={(e) => setOnlyDiff(e.target.checked)} />
          Só diferenças
        </label>
      </div>

      <div className="overflow-x-auto rounded-sm border border-border">
        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr className="bg-muted">
              <th className="sticky left-0 z-10 min-w-24 bg-muted px-2 py-1.5 text-2xs font-medium text-muted-foreground">
                Propriedade
              </th>
              {results.map((r, i) => (
                <th key={r.element.id} className="min-w-28 px-2 py-1.5">
                  <button
                    type="button"
                    className="max-w-40 truncate text-left text-2xs font-semibold hover:underline"
                    onClick={() => inspector.setPrimary(r.element.id)}
                    onMouseEnter={() => inspector.highlight(r.element.id)}
                    onMouseLeave={() => inspector.highlight(null)}
                    title="Destacar na página"
                  >
                    {i + 1}. {r.component.name}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr
                key={`${row.group}-${row.label}`}
                className={cx("border-t border-border", row.same ? "text-muted-foreground" : "bg-warning-subtle/40")}
              >
                <td className={cx("sticky left-0 z-10 px-2 py-1.5 text-2xs", row.same ? "bg-background" : "bg-warning-subtle")}>
                  <span className="block text-[10px] text-muted-foreground">{row.group}</span>
                  {row.label}
                </td>
                {row.values.map((cell, i) => (
                  <td key={i} className="px-2 py-1.5 align-top">
                    <span className={cx("block break-words", !row.same && "font-medium text-foreground")}>{cell.display}</span>
                    {cell.token && <span className="block truncate font-mono text-[10px] text-muted-foreground">{cell.token}</span>}
                  </td>
                ))}
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={results.length + 1} className="px-2 py-6 text-center text-xs text-muted-foreground">
                  Nenhuma diferença. Desmarque “Só diferenças” para ver tudo.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
