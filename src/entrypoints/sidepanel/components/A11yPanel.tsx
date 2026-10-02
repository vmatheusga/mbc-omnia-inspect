import type { InspectionResult } from "../../../engine/types";
import { Badge, Mono, Section } from "./ui";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[96px_1fr] items-start gap-2 py-1 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0 break-words">{children}</span>
    </div>
  );
}

export function A11yPanel({ result }: { result: InspectionResult }) {
  const { a11y } = result;
  const contrast = a11y.contrast;
  return (
    <div className="flex flex-col gap-4">
      {contrast && (
        <Section title="Contraste">
          <div className="flex items-center gap-3 rounded-md border border-border p-3">
            <div
              className="flex size-14 shrink-0 items-center justify-center rounded-sm border border-overlay-10 text-xl font-semibold"
              style={{ color: contrast.foreground.split(" ")[0], background: contrast.background.split(" ")[0] }}
            >
              Aa
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xl font-semibold tabular-nums">{contrast.ratio.toFixed(2)}:1</span>
              <div className="flex gap-1">
                <Badge tone={contrast.aa ? "success" : "destructive"}>AA {contrast.aa ? "✓" : "✗"}</Badge>
                <Badge tone={contrast.aaa ? "success" : "neutral"}>AAA {contrast.aaa ? "✓" : "✗"}</Badge>
                <Badge tone="outline">{contrast.largeText ? "texto grande" : "texto normal"}</Badge>
              </div>
              <span className="font-mono text-2xs text-muted-foreground">
                {contrast.foreground} sobre {contrast.background}
              </span>
            </div>
          </div>
        </Section>
      )}

      <Section title="Semântica">
        <div className="flex flex-col divide-y divide-border">
          <Row label="Papel (role)">
            {a11y.role ? (
              <>
                <Mono>{a11y.role}</Mono>
                {a11y.implicitRole && <span className="ml-1 text-2xs text-muted-foreground">implícito</span>}
              </>
            ) : (
              <span className="text-muted-foreground">nenhum</span>
            )}
          </Row>
          <Row label="Nome acessível">
            {a11y.name ? `“${a11y.name}”` : <span className="text-muted-foreground">vazio</span>}
          </Row>
          <Row label="Foco">
            {a11y.focusable ? <Badge tone="success">focável</Badge> : <Badge>não focável</Badge>}
            {a11y.tabIndex !== undefined && <Mono className="ml-1">tabindex={a11y.tabIndex}</Mono>}
          </Row>
        </div>
      </Section>

      {a11y.states.length > 0 && (
        <Section title="Estados">
          <div className="flex flex-wrap gap-1.5">
            {a11y.states.map((s) => (
              <Mono key={s.key}>
                {s.key}=<span className="text-info-subtle-foreground">{s.value}</span>
              </Mono>
            ))}
          </div>
        </Section>
      )}

      {a11y.aria.length > 0 && (
        <Section title="ARIA">
          <div className="flex flex-wrap gap-1.5">
            {a11y.aria.map((s) => (
              <Mono key={s.key}>
                {s.key}=<span className="text-info-subtle-foreground">{s.value}</span>
              </Mono>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}
