import type { InspectionResult, TokenUsage } from "../../../engine/types";
import { PropertiesView } from "./PropertiesView";
import { BoxModelView } from "./BoxModelView";
import { Mono, Section, cx } from "./ui";

const SOURCE_STYLE: Record<TokenUsage["source"], { dot: string; label: string }> = {
  classe: { dot: "bg-success", label: "Token aplicado por classe" },
  valor: { dot: "bg-info", label: "Valor corresponde a um token" },
  escala: { dot: "bg-info", label: "Dentro da escala" },
  herdado: { dot: "bg-muted-foreground", label: "Herdado do elemento pai" },
  "fora do padrão": { dot: "bg-warning", label: "Não corresponde a nenhum token" },
};

export function TokensPanel({ result }: { result: InspectionResult }) {
  return (
    <div className="flex flex-col gap-4">
      <Section title="Anatomia da camada">
        <BoxModelView box={result.boxModel} />
      </Section>

      <PropertiesView sections={result.properties} />

      {result.responsive.length > 0 && (
        <Section
          title="Responsivo"
          action={
            <span className="font-mono text-2xs text-muted-foreground">
              {result.page.viewportWidth}px · {result.page.breakpoint}
            </span>
          }
        >
          <div className="flex flex-col gap-1">
            {result.responsive.map((rule) => (
              <div
                key={rule.breakpoint}
                className={cx("flex items-start gap-2 rounded-xs px-1.5 py-1 text-xs", rule.active ? "bg-success-subtle/60" : "opacity-60")}
                title={rule.active ? "Ativo neste tamanho" : "Inativo neste tamanho"}
              >
                <span
                  className={cx(
                    "w-14 shrink-0 rounded-xs px-1 text-center font-mono text-2xs font-semibold",
                    rule.active ? "bg-success text-success-foreground" : "bg-muted text-muted-foreground",
                  )}
                >
                  {rule.breakpoint}
                </span>
                <span className="text-2xs text-muted-foreground">{rule.breakpoint.startsWith("max") ? "<" : "≥"}{rule.width}</span>
                <span className="min-w-0 flex-1 font-mono text-[11px] break-words">
                  {rule.classes.map((c) => c.replace(`${rule.breakpoint}:`, "")).join(" ")}
                </span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {result.stateTokens.length > 0 && (
        <Section title="Estados (hover, focus, data-*)">
          <div className="flex flex-col gap-1">
            {result.stateTokens.map((s, i) => (
              <div key={`${s.state}-${s.utility}-${i}`} className="flex flex-wrap items-center gap-1.5 text-xs">
                <span className="rounded-xs bg-info-subtle px-1.5 py-px font-mono text-2xs text-info-subtle-foreground">
                  {s.state}
                </span>
                <span className="font-mono text-[11px]">{s.utility}</span>
                {s.token && <Mono>{s.token}</Mono>}
              </div>
            ))}
          </div>
        </Section>
      )}

      <div className="flex flex-wrap gap-x-3 gap-y-1 border-t border-border pt-3 text-2xs text-muted-foreground">
        {(["classe", "valor", "herdado", "fora do padrão"] as const).map((key) => (
          <span key={key} className="flex items-center gap-1">
            <span className={cx("size-1.5 rounded-full", SOURCE_STYLE[key].dot)} />
            {SOURCE_STYLE[key].label}
          </span>
        ))}
      </div>
    </div>
  );
}
