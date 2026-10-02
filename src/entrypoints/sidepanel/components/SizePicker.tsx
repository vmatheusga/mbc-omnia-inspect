import { Check, Laptop, Monitor, Plus, Smartphone, Tablet, X } from "lucide-react";
import { useState } from "react";
import type { ViewportSpec } from "../../../shared/messages";
import { BREAKPOINT_SPECS, DEVICE_PRESETS, customSpec, deviceKind } from "../../../shared/viewports";
import { Section, cx } from "./ui";

const KIND_ICON = { mobile: Smartphone, tablet: Tablet, desktop: Laptop };

export function DeviceIcon({ width, className }: { width: number; className?: string }) {
  const Icon = width >= 1600 ? Monitor : KIND_ICON[deviceKind(width)];
  return <Icon className={className} />;
}

export const dims = (spec: { width: number; height?: number }) =>
  spec.height ? `${spec.width} × ${spec.height}` : `${spec.width} px`;

/** Todos os tamanhos conhecidos (breakpoints, dispositivos e personalizados), por id. */
export function sizeRegistry(customs: ViewportSpec[]) {
  return new Map([...BREAKPOINT_SPECS, ...DEVICE_PRESETS, ...customs].map((s) => [s.id, s]));
}

export function SizePicker({
  multiple,
  selected,
  onChange,
  customs,
  onCustomsChange,
  title = "Tamanhos",
  note,
}: {
  multiple: boolean;
  selected: string[];
  onChange: (ids: string[]) => void;
  customs: ViewportSpec[];
  onCustomsChange: (list: ViewportSpec[]) => void;
  title?: string;
  note?: React.ReactNode;
}) {
  const [draft, setDraft] = useState({ width: "", height: "" });
  const isOn = (id: string) => selected.includes(id);
  const toggle = (id: string) => {
    if (!multiple) return onChange([id]);
    onChange(isOn(id) ? selected.filter((s) => s !== id) : [...selected, id]);
  };
  const allBreakpoints = BREAKPOINT_SPECS.every((bp) => isOn(bp.id));

  const addCustom = (e: React.FormEvent) => {
    e.preventDefault();
    const width = Math.max(200, Math.min(4000, parseInt(draft.width, 10) || 0));
    const height = Math.max(200, Math.min(4000, parseInt(draft.height, 10) || 0));
    if (!parseInt(draft.width, 10) || !parseInt(draft.height, 10)) return;
    const spec = customSpec(width, height);
    if (!customs.some((c) => c.id === spec.id)) onCustomsChange([...customs, spec]);
    onChange(multiple ? [...new Set([...selected, spec.id])] : [spec.id]);
    setDraft({ width: "", height: "" });
  };

  return (
    <Section
      title={title}
      action={
        multiple ? (
          <div className="flex items-center gap-2 text-2xs">
            <button
              type="button"
              className="text-info hover:underline"
              onClick={() =>
                onChange(
                  allBreakpoints
                    ? selected.filter((id) => !id.startsWith("bp-"))
                    : [...new Set([...selected, ...BREAKPOINT_SPECS.map((b) => b.id)])],
                )
              }
            >
              {allBreakpoints ? "Tirar breakpoints" : "Todos os breakpoints"}
            </button>
            {selected.length > 0 && (
              <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => onChange([])}>
                Limpar
              </button>
            )}
          </div>
        ) : undefined
      }
    >
      {note}
      <div className="flex flex-col gap-1">
        <span className="text-2xs text-muted-foreground">Breakpoints do Tailwind</span>
        <div className="flex gap-1">
          {BREAKPOINT_SPECS.map((bp) => (
            <button
              key={bp.id}
              type="button"
              aria-pressed={isOn(bp.id)}
              onClick={() => toggle(bp.id)}
              title={bp.label === "base" ? "Abaixo de 640px (usa 375 × 812)" : `min-width: ${bp.width}px · altura da aba`}
              className={cx(
                "flex flex-1 flex-col items-center rounded-sm border px-1 py-1.5 transition-colors",
                isOn(bp.id) ? "border-info bg-info-subtle text-info-subtle-foreground" : "border-border hover:bg-accent",
              )}
            >
              <span className="font-mono text-xs font-semibold">{bp.label}</span>
              <span className="text-2xs opacity-70">{bp.width}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col">
        <span className="mb-0.5 text-2xs text-muted-foreground">Dispositivos</span>
        {[...DEVICE_PRESETS, ...customs].map((spec) => {
          const custom = spec.id.startsWith("custom-");
          return (
            <div
              key={spec.id}
              className={cx(
                "group flex items-center gap-2 rounded-xs px-1 py-1 text-xs",
                isOn(spec.id) ? "bg-info-subtle/60" : "hover:bg-accent",
              )}
            >
              <button
                type="button"
                role={multiple ? "checkbox" : "radio"}
                aria-checked={isOn(spec.id)}
                onClick={() => toggle(spec.id)}
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
              >
                <span
                  className={cx(
                    "flex size-3.5 shrink-0 items-center justify-center border",
                    multiple ? "rounded-[3px]" : "rounded-full",
                    isOn(spec.id) ? "border-info bg-info text-info-foreground" : "border-input bg-background",
                  )}
                >
                  {isOn(spec.id) && (multiple ? <Check className="size-2.5" /> : <span className="size-1.5 rounded-full bg-current" />)}
                </span>
                <DeviceIcon width={spec.width} className="size-3.5 shrink-0 opacity-60" />
                <span className="flex-1 truncate">{custom ? "Personalizado" : spec.label}</span>
                <span className="font-mono text-2xs text-muted-foreground">{dims(spec)}</span>
              </button>
              {custom && (
                <button
                  type="button"
                  title="Remover tamanho"
                  className="rounded-xs p-0.5 text-muted-foreground opacity-0 hover:text-foreground group-hover:opacity-100"
                  onClick={() => {
                    onCustomsChange(customs.filter((c) => c.id !== spec.id));
                    onChange(selected.filter((id) => id !== spec.id));
                  }}
                >
                  <X className="size-3" />
                </button>
              )}
            </div>
          );
        })}
        <form onSubmit={addCustom} className="mt-1 flex items-center gap-1.5 px-1">
          <input
            aria-label="Largura"
            inputMode="numeric"
            placeholder="Largura"
            value={draft.width}
            onChange={(e) => setDraft((d) => ({ ...d, width: e.target.value }))}
            className="h-7 w-16 rounded-sm border border-input bg-input-background px-2 font-mono text-xs"
          />
          <span className="text-muted-foreground">×</span>
          <input
            aria-label="Altura"
            inputMode="numeric"
            placeholder="Altura"
            value={draft.height}
            onChange={(e) => setDraft((d) => ({ ...d, height: e.target.value }))}
            className="h-7 w-16 rounded-sm border border-input bg-input-background px-2 font-mono text-xs"
          />
          <button
            type="submit"
            className="ml-auto inline-flex h-7 items-center gap-1 rounded-sm px-2 text-xs text-foreground-alt hover:bg-accent disabled:opacity-40"
            disabled={!draft.width || !draft.height}
          >
            <Plus className="size-3.5" /> Tamanho
          </button>
        </form>
      </div>
    </Section>
  );
}
