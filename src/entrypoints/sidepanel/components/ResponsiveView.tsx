import {
  Camera,
  ChevronDown,
  Columns3,
  Laptop,
  Loader2,
  Monitor,
  RotateCw,
  Smartphone,
  Square,
  Tablet,
  TriangleAlert,
  X,
} from "lucide-react";
import { useState } from "react";
import { currentBreakpoint } from "../../../engine/tailwind";
import type { StageMode, ViewportSpec } from "../../../shared/messages";
import { BREAKPOINT_SPECS, DEFAULT_COMPARE, DEVICE_PRESETS, deviceKind, rotate } from "../../../shared/viewports";
import type { Inspector } from "../useInspector";
import { Button, IconButton, Section, cx } from "./ui";

const KIND_ICON = { mobile: Smartphone, tablet: Tablet, desktop: Laptop };

function DeviceIcon({ width, className }: { width: number; className?: string }) {
  const Icon = width >= 1600 ? Monitor : KIND_ICON[deviceKind(width)];
  return <Icon className={className} />;
}

const dims = (spec: { width: number; height?: number }) => (spec.height ? `${spec.width} × ${spec.height}` : `${spec.width} px`);

const ALL_BREAKPOINTS = BREAKPOINT_SPECS.map((bp) => ({ ...bp, label: `${bp.label} · ${bp.width}` }));

/** Faixa compacta mostrada em todas as telas enquanto há visualização responsiva. */
export function ViewportIndicator({ inspector, onOpen }: { inspector: Inspector; onOpen: () => void }) {
  const stage = inspector.stage.state;
  const native = inspector.viewport.applied;
  if (!stage && !native) return null;
  const text = stage
    ? stage.mode === "single"
      ? `${stage.devices[0].label} · ${dims(stage.devices[0])} · ${currentBreakpoint(stage.devices[0].width)}`
      : `Lado a lado · ${stage.devices.length} tamanhos`
    : `Emulação · ${native!.label} · ${native!.width}×${native!.height}`;
  return (
    <div className="flex items-center gap-2 border-b border-info-subtle bg-info-subtle px-3 py-1.5 text-xs text-info-subtle-foreground">
      {stage?.mode === "side-by-side" ? (
        <Columns3 className="size-3.5 shrink-0" />
      ) : (
        <DeviceIcon width={stage?.devices[0].width ?? native!.width} className="size-3.5 shrink-0" />
      )}
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 truncate text-left font-medium hover:underline">
        {text}
      </button>
      <IconButton
        title="Fechar visualização responsiva"
        className="size-6 text-info-subtle-foreground hover:bg-info/15"
        onClick={() => (stage ? inspector.stage.hide() : inspector.viewport.set(null))}
      >
        <X />
      </IconButton>
    </div>
  );
}

export function ResponsiveView({ inspector, onOpenCapture }: { inspector: Inspector; onOpenCapture: () => void }) {
  const { stage, viewport } = inspector;
  const [mode, setMode] = useState<StageMode>(stage.state?.mode ?? "single");
  const [custom, setCustom] = useState({ width: "390", height: "844" });
  const [compare, setCompare] = useState<Set<string>>(new Set(DEFAULT_COMPARE));
  const [busy, setBusy] = useState(false);
  const [advanced, setAdvanced] = useState(false);

  const current = stage.state?.mode === "single" ? stage.state.devices[0] : null;
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };
  const showSingle = (spec: ViewportSpec) => run(() => stage.show([spec], "single"));
  const showSideBySide = (specs: ViewportSpec[]) => run(() => stage.show(specs, "side-by-side"));
  const isCurrent = (spec: ViewportSpec) =>
    !!current && current.width === spec.width && (current.height ?? 0) === (spec.height ?? 0);

  const selectedDevices = DEVICE_PRESETS.filter((s) => compare.has(s.id));

  return (
    <main className="flex flex-1 flex-col gap-5 overflow-y-auto p-3">
      {/* Modo */}
      <div role="tablist" className="flex gap-0.5 rounded-sm bg-muted p-0.5">
        {(
          [
            { value: "single", label: "Um dispositivo", icon: Square },
            { value: "side-by-side", label: "Lado a lado", icon: Columns3 },
          ] as const
        ).map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            role="tab"
            type="button"
            aria-selected={mode === value}
            onClick={() => setMode(value)}
            className={cx(
              "flex h-8 flex-1 items-center justify-center gap-1.5 rounded-xs text-xs font-medium",
              mode === value ? "bg-background shadow-xs" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Estado atual */}
      {stage.state && (
        <div className="flex items-center gap-3 rounded-md border border-border bg-card p-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-sm bg-muted">
            {current ? <DeviceIcon width={current.width} className="size-5" /> : <Columns3 className="size-5" />}
          </span>
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm font-semibold">
              {current ? current.label : `Lado a lado · ${stage.state.devices.length} tamanhos`}
            </span>
            <span className="truncate font-mono text-2xs text-muted-foreground">
              {current
                ? `${dims(current)} · ${currentBreakpoint(current.width)}`
                : stage.state.devices.map((d) => d.width).join(" · ")}
            </span>
          </div>
          {busy && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
          {current?.height && (
            <IconButton title="Girar" onClick={() => showSingle(rotate(current))}>
              <RotateCw />
            </IconButton>
          )}
          <Button variant="outline" onClick={stage.hide}>
            Fechar
          </Button>
        </div>
      )}

      {mode === "single" ? (
        <>
          <Section title="Breakpoints do Tailwind">
            <div className="flex gap-1">
              {BREAKPOINT_SPECS.map((bp) => {
                const active = !!current && currentBreakpoint(current.width) === bp.label;
                return (
                  <button
                    key={bp.id}
                    type="button"
                    disabled={busy}
                    onClick={() => showSingle(bp)}
                    title={bp.label === "base" ? "Abaixo de 640px (mostra 375px)" : `min-width: ${bp.width}px`}
                    className={cx(
                      "flex flex-1 flex-col items-center rounded-sm border px-1 py-1.5 transition-colors disabled:opacity-50",
                      active ? "border-info bg-info-subtle text-info-subtle-foreground" : "border-border hover:bg-accent",
                    )}
                  >
                    <span className="font-mono text-xs font-semibold">{bp.label}</span>
                    <span className="text-2xs text-muted-foreground">{bp.width}</span>
                  </button>
                );
              })}
            </div>
          </Section>

          <Section title="Dispositivos">
            <div className="-mx-1 flex flex-col">
              {DEVICE_PRESETS.map((spec) => (
                <button
                  key={spec.id}
                  type="button"
                  disabled={busy}
                  onClick={() => showSingle(spec)}
                  className={cx(
                    "flex items-center gap-2.5 rounded-sm px-2 py-1.5 text-left text-xs transition-colors disabled:opacity-50",
                    isCurrent(spec) ? "bg-info-subtle text-info-subtle-foreground" : "hover:bg-accent",
                  )}
                >
                  <DeviceIcon width={spec.width} className="size-4 shrink-0 opacity-70" />
                  <span className="flex-1 font-medium">{spec.label}</span>
                  <span className="font-mono text-2xs text-muted-foreground">{dims(spec)}</span>
                </button>
              ))}
            </div>
          </Section>

          <Section title="Personalizado">
            <form
              className="flex items-center gap-1.5"
              onSubmit={(e) => {
                e.preventDefault();
                const width = Math.max(200, Math.min(4000, parseInt(custom.width, 10) || 0));
                const height = Math.max(200, Math.min(4000, parseInt(custom.height, 10) || 0));
                void showSingle({ id: `custom-${width}x${height}`, label: "Personalizado", width, height, mobile: width < 1024 });
              }}
            >
              <input
                aria-label="Largura"
                inputMode="numeric"
                value={custom.width}
                onChange={(e) => setCustom((c) => ({ ...c, width: e.target.value }))}
                className="h-8 w-20 rounded-sm border border-input bg-input-background px-2 font-mono text-xs"
              />
              <span className="text-muted-foreground">×</span>
              <input
                aria-label="Altura"
                inputMode="numeric"
                value={custom.height}
                onChange={(e) => setCustom((c) => ({ ...c, height: e.target.value }))}
                className="h-8 w-20 rounded-sm border border-input bg-input-background px-2 font-mono text-xs"
              />
              <Button type="submit" variant="outline" className="ml-auto" disabled={busy}>
                Aplicar
              </Button>
            </form>
          </Section>
        </>
      ) : (
        <>
          <Section title="Atalhos">
            <div className="flex flex-col gap-1.5">
              <Button variant="outline" disabled={busy} onClick={() => showSideBySide(ALL_BREAKPOINTS)}>
                <Columns3 /> Todos os breakpoints (base → 2xl)
              </Button>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() =>
                  showSideBySide(DEVICE_PRESETS.filter((d) => ["mobile-m", "tablet", "laptop"].includes(d.id)))
                }
              >
                <Smartphone /> Mobile · Tablet · Laptop
              </Button>
            </div>
          </Section>
          <Section title="Escolher dispositivos">
            <div className="flex flex-col">
              {DEVICE_PRESETS.map((spec) => (
                <label key={spec.id} className="flex items-center gap-2 rounded-xs px-1 py-1 text-xs hover:bg-accent">
                  <input
                    type="checkbox"
                    checked={compare.has(spec.id)}
                    onChange={(e) =>
                      setCompare((set) => {
                        const next = new Set(set);
                        if (e.target.checked) next.add(spec.id);
                        else next.delete(spec.id);
                        return next;
                      })
                    }
                  />
                  <DeviceIcon width={spec.width} className="size-3.5 opacity-60" />
                  <span className="flex-1">{spec.label}</span>
                  <span className="font-mono text-2xs text-muted-foreground">{dims(spec)}</span>
                </label>
              ))}
            </div>
            <Button
              variant="info"
              disabled={busy || selectedDevices.length === 0}
              onClick={() => showSideBySide(selectedDevices)}
            >
              {busy ? <Loader2 className="animate-spin" /> : <Columns3 />}
              Mostrar {selectedDevices.length} lado a lado
            </Button>
          </Section>
        </>
      )}

      <p className="text-2xs text-muted-foreground">
        A página é carregada em molduras (iframes) com o tamanho exato de cada dispositivo, então as media queries e os
        breakpoints <span className="font-mono">sm/md/lg</span> respondem de verdade. Dá para navegar, rolar e usar{" "}
        <b>Inspecionar</b> dentro das molduras. <span className="font-mono">Esc</span> fecha.
      </p>

      <button
        type="button"
        onClick={onOpenCapture}
        className="flex items-center gap-2.5 rounded-md border border-border p-2.5 text-left hover:bg-accent"
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-sm bg-muted">
          <Camera className="size-4" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-xs font-medium">Prints e vídeos</span>
          <span className="text-2xs text-muted-foreground">
            Capture os tamanhos escolhidos ou grave a tela com auto scroll na aba Capturar.
          </span>
        </span>
      </button>

      {/* Avançado: emulação nativa */}
      <div className="border-t border-border pt-3">
        <button
          type="button"
          onClick={() => setAdvanced((v) => !v)}
          className="flex w-full items-center justify-between text-2xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
        >
          Avançado · emulação nativa
          <ChevronDown className={cx("size-3.5 transition-transform", advanced && "rotate-180")} />
        </button>
        {advanced && viewport.supported && (
          <div className="mt-3 flex flex-col gap-4">
            <Section title="Emulação nativa do Chrome">
              <p className="-mt-1 text-2xs text-muted-foreground">
                Redimensiona a própria aba, como o modo dispositivo do DevTools. Use em páginas que não aceitam moldura.
                O Chrome mostra uma faixa amarela de depuração enquanto está ativa.
              </p>
              <div className="flex flex-wrap gap-1">
                {DEVICE_PRESETS.map((spec) => (
                  <button
                    key={spec.id}
                    type="button"
                    disabled={viewport.busy}
                    onClick={() => void viewport.set(spec)}
                    className={cx(
                      "rounded-xs border px-1.5 py-0.5 text-2xs",
                      viewport.applied?.width === spec.width && viewport.applied?.height === spec.height
                        ? "border-info bg-info-subtle text-info-subtle-foreground"
                        : "border-border hover:bg-accent",
                    )}
                  >
                    {spec.label}
                  </button>
                ))}
                {viewport.applied && (
                  <button
                    type="button"
                    onClick={() => void viewport.set(null)}
                    className="rounded-xs border border-border px-1.5 py-0.5 text-2xs hover:bg-accent"
                  >
                    Tamanho real
                  </button>
                )}
              </div>
              {viewport.error && (
                <p className="flex items-start gap-1.5 rounded-sm bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
                  <TriangleAlert className="mt-px size-3.5 shrink-0" /> {viewport.error}
                </p>
              )}
            </Section>

          </div>
        )}
        {advanced && !viewport.supported && (
          <p className="mt-2 text-2xs text-muted-foreground">Disponível apenas na extensão instalada.</p>
        )}
      </div>
    </main>
  );
}
