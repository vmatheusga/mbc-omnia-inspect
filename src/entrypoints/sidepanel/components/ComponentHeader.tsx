import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ChevronDown, ChevronRight, Info } from "lucide-react";
import { useState } from "react";
import type { InspectionResult, VariantGuess } from "../../../engine/types";
import type { Inspector } from "../useInspector";
import { Badge, IconButton, KIND_META, cx } from "./ui";

const SOURCE_LABEL: Record<VariantGuess["source"], string> = {
  react: "props React",
  atributo: "atributo data-*",
  classes: "classes",
  padrão: "valor padrão",
};

const KIND_HELP = {
  omnia: "Componente do Omnia DS (@omnia-ds/ui), reconhecido pelo data-slot e pelas classes das variantes.",
  shadcn: "Componente shadcn/ui instalado localmente no projeto — não é o do Omnia DS.",
  react: "Componente React da própria aplicação (fora do design system), identificado pelo nome no React.",
  native: "Elemento HTML comum, sem componente de design system ou React identificado.",
} as const;

function Confidence({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const tone = pct >= 80 ? "bg-success" : pct >= 60 ? "bg-warning" : "bg-destructive";
  return (
    <span
      className="inline-flex cursor-help items-center gap-1.5 text-2xs text-muted-foreground"
      title={`Confiança da identificação: ${pct}%\nVerde ≥ 80% (alta) · amarelo 60–79% (provável) · vermelho < 60% (palpite).\nVeja os motivos em “Como identifiquei”.`}
    >
      <span className="h-1 w-10 overflow-hidden rounded-full bg-muted">
        <span className={cx("block h-full rounded-full", tone)} style={{ width: `${pct}%` }} />
      </span>
      {pct}%
    </span>
  );
}

export function ComponentHeader({ result, inspector }: { result: InspectionResult; inspector: Inspector }) {
  const [showReasons, setShowReasons] = useState(false);
  const { component, element, tree } = result;
  const kind = KIND_META[component.kind];
  const componentAncestors = tree.ancestors.filter((n) => n.kind !== "native");
  const crumbs = (componentAncestors.length ? componentAncestors : tree.ancestors).slice(0, 3).reverse();

  return (
    <div className="flex flex-col gap-3 rounded-md border border-border bg-card p-3">
      {/* Breadcrumb + navegação */}
      <div className="flex items-center justify-between gap-2">
        <nav className="flex min-w-0 items-center gap-0.5 overflow-hidden text-2xs text-muted-foreground">
          {tree.ancestors.length > crumbs.length && <span className="shrink-0">…</span>}
          {crumbs.map((node) => (
            <span key={node.id} className="flex min-w-0 items-center gap-0.5">
              <button
                type="button"
                className="truncate rounded-xs px-1 text-2xs hover:bg-accent hover:text-foreground"
                onClick={() => inspector.select(node.id)}
                onMouseEnter={() => inspector.highlight(node.id)}
                onMouseLeave={() => inspector.highlight(null)}
                title={node.detail}
              >
                {node.label}
              </button>
              <ChevronRight className="size-3 shrink-0" />
            </span>
          ))}
          <span className="truncate font-medium text-foreground">{component.name}</span>
        </nav>
        <div className="flex shrink-0 items-center">
          <IconButton title="Elemento pai (↑)" onClick={() => inspector.navigate("parent")}>
            <ArrowUp />
          </IconButton>
          <IconButton title="Primeiro filho (↓)" onClick={() => inspector.navigate("child")}>
            <ArrowDown />
          </IconButton>
          <IconButton title="Irmão anterior (←)" onClick={() => inspector.navigate("prev")}>
            <ArrowLeft />
          </IconButton>
          <IconButton title="Próximo irmão (→)" onClick={() => inspector.navigate("next")}>
            <ArrowRight />
          </IconButton>
        </div>
      </div>

      {/* Identidade */}
      <div className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span title={KIND_HELP[component.kind]} className="cursor-help">
            <Badge tone={kind.tone}>{kind.label}</Badge>
          </span>
          {component.designSystem && component.kind === "shadcn" && (
            <Badge tone="outline">{component.designSystem}</Badge>
          )}
          <Confidence value={component.confidence} />
        </div>
        <div className="flex items-baseline gap-2">
          <h2 className="truncate text-xl font-semibold leading-tight">
            {component.family && component.part ? (
              <>
                <span className="text-muted-foreground">{component.family} › </span>
                {component.part}
              </>
            ) : (
              component.name
            )}
          </h2>
          <span className="shrink-0 font-mono text-2xs text-muted-foreground">
            {element.width}×{element.height}
          </span>
        </div>
        {component.summary && <p className="text-xs text-foreground-alt">{component.summary}</p>}
      </div>

      {/* Variantes */}
      {component.variants.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {component.variants.map((v) => (
            <span
              key={v.dimension}
              className="inline-flex items-center gap-1 rounded-sm border border-border bg-background px-2 py-1 text-xs"
              title={`Fonte: ${SOURCE_LABEL[v.source]} · confiança ${Math.round(v.confidence * 100)}%`}
            >
              <span className="text-muted-foreground">{v.dimension}</span>
              <span className="font-mono font-medium">{v.value}</span>
              {v.isDefault && <span className="text-2xs text-muted-foreground">(padrão)</span>}
              {v.confidence < 0.7 && <span className="text-2xs text-warning-subtle-foreground">?</span>}
            </span>
          ))}
        </div>
      )}

      {/* Contexto React */}
      {component.reactOwners && component.reactOwners.length > 0 && (
        <p className="text-2xs text-muted-foreground">
          Renderizado em{" "}
          {component.reactOwners.slice(0, 4).map((o, i) => (
            <span key={o + i}>
              {i > 0 && " › "}
              <span className="font-mono text-foreground-alt">{`<${o}>`}</span>
            </span>
          ))}
        </p>
      )}

      <button
        type="button"
        onClick={() => setShowReasons((v) => !v)}
        className="flex items-center gap-1 self-start text-2xs text-muted-foreground hover:text-foreground"
      >
        <Info className="size-3" />
        Como identifiquei
        <ChevronDown className={cx("size-3 transition-transform", showReasons && "rotate-180")} />
      </button>
      {showReasons && (
        <ul className="-mt-1 flex list-disc flex-col gap-0.5 pl-5 text-2xs text-foreground-alt">
          {component.reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
          <li className="font-mono">{element.selector}</li>
        </ul>
      )}
    </div>
  );
}
