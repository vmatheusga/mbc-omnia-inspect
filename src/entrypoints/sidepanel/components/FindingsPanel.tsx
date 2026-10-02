import { AlertTriangle, CheckCircle2, Info, Lightbulb, XCircle } from "lucide-react";
import type { Finding, InspectionResult } from "../../../engine/types";
import { CopyButton, cx } from "./ui";

const ICONS = {
  error: { icon: XCircle, className: "text-destructive", border: "border-destructive/30 bg-destructive/5" },
  warning: { icon: AlertTriangle, className: "text-warning", border: "border-warning-subtle bg-warning-subtle/40" },
  info: { icon: Info, className: "text-info", border: "border-border bg-card" },
};

const CATEGORY: Record<Finding["category"], string> = {
  token: "Token",
  classe: "Classe",
  inline: "Estilo inline",
  componente: "Componente",
  a11y: "Acessibilidade",
};

export function FindingsPanel({ result }: { result: InspectionResult }) {
  if (!result.findings.length) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-md border border-dashed border-border px-4 py-8 text-center">
        <CheckCircle2 className="size-6 text-success" />
        <p className="text-sm font-medium">Nada fora do padrão</p>
        <p className="text-xs text-muted-foreground">
          Todos os valores deste elemento correspondem a tokens do Omnia DS.
        </p>
      </div>
    );
  }
  return (
    <ul className="flex flex-col gap-2">
      {result.findings.map((f, i) => {
        const meta = ICONS[f.severity];
        const Icon = meta.icon;
        return (
          <li key={`${f.title}-${i}`} className={cx("flex gap-2.5 rounded-md border p-2.5", meta.border)}>
            <Icon className={cx("mt-px size-4 shrink-0", meta.className)} />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-medium leading-snug break-words">{f.title}</p>
                <span className="shrink-0 text-2xs text-muted-foreground">{CATEGORY[f.category]}</span>
              </div>
              {f.detail && <p className="text-2xs text-foreground-alt break-words">{f.detail}</p>}
              {f.suggestion && (
                <div className="flex items-center gap-1.5 rounded-xs bg-background/70 py-0.5 pl-1.5 text-2xs">
                  <Lightbulb className="size-3 shrink-0 text-warning" />
                  <span className="min-w-0 flex-1 font-mono break-words">{f.suggestion}</span>
                  <CopyButton text={f.suggestion} label="Copiar sugestão" />
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
