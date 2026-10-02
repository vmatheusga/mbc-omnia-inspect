import { Check, Copy } from "lucide-react";
import { useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import type { ComponentKind, Severity } from "../../../engine/types";

export function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

type Tone = "neutral" | "brand" | "info" | "success" | "warning" | "destructive" | "outline";

const TONES: Record<Tone, string> = {
  neutral: "bg-secondary text-secondary-foreground",
  brand: "bg-brand-subtle text-brand-subtle-foreground",
  info: "bg-info-subtle text-info-subtle-foreground",
  success: "bg-success-subtle text-success-subtle-foreground",
  warning: "bg-warning-subtle text-warning-subtle-foreground",
  destructive: "bg-destructive/10 text-destructive",
  outline: "border border-border text-foreground",
};

export function Badge({ tone = "neutral", className, children }: { tone?: Tone; className?: string; children: ReactNode }) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-xs px-1.5 py-0.5 text-2xs font-medium",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export const KIND_META: Record<ComponentKind, { label: string; tone: Tone }> = {
  omnia: { label: "Omnia DS", tone: "brand" },
  shadcn: { label: "shadcn/ui", tone: "info" },
  react: { label: "React", tone: "success" },
  native: { label: "HTML", tone: "neutral" },
};

export const SEVERITY_TONE: Record<Severity, Tone> = {
  error: "destructive",
  warning: "warning",
  info: "info",
};

export function IconButton({
  className,
  active,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      className={cx(
        "inline-flex size-7 shrink-0 items-center justify-center rounded-sm text-foreground-alt transition-colors hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-4",
        active && "bg-accent text-accent-foreground",
        className,
      )}
      {...props}
    />
  );
}

export function Button({
  className,
  variant = "default",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "default" | "info" | "outline" | "ghost" }) {
  const variants = {
    default: "bg-primary text-primary-foreground hover:bg-primary/90",
    info: "bg-info text-info-foreground hover:bg-info/90",
    outline: "border border-input bg-background text-foreground hover:bg-accent",
    ghost: "text-foreground hover:bg-accent",
  };
  return (
    <button
      type="button"
      className={cx(
        "inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-sm px-3 text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-3.5",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}

export function useCopy(timeout = 1200) {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = async (text: string, key = text) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const area = document.createElement("textarea");
      area.value = text;
      document.body.append(area);
      area.select();
      document.execCommand("copy");
      area.remove();
    }
    setCopied(key);
    setTimeout(() => setCopied((c) => (c === key ? null : c)), timeout);
  };
  return { copied, copy };
}

export function CopyButton({ text, label = "Copiar" }: { text: string; label?: string }) {
  const { copied, copy } = useCopy();
  return (
    <IconButton title={label} aria-label={label} onClick={() => copy(text)}>
      {copied ? <Check className="text-success" /> : <Copy />}
    </IconButton>
  );
}

export function Section({
  title,
  action,
  children,
  className,
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cx("flex flex-col gap-2", className)}>
      {(title || action) && (
        <header className="flex items-center justify-between gap-2">
          <h3 className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function Mono({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <code className={cx("rounded-xs bg-muted px-1 py-px font-mono text-[11px] text-foreground", className)}>
      {children}
    </code>
  );
}

export function Tabs<T extends string>({
  value,
  onChange,
  items,
}: {
  value: T;
  onChange: (v: T) => void;
  items: Array<{ value: T; label: string; count?: number; tone?: Tone }>;
}) {
  return (
    <div role="tablist" className="flex gap-0.5 overflow-x-auto rounded-sm bg-muted p-0.5 [scrollbar-width:none]">
      {items.map((item) => (
        <button
          key={item.value}
          role="tab"
          type="button"
          aria-selected={value === item.value}
          onClick={() => onChange(item.value)}
          className={cx(
            "flex h-7 flex-auto shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-xs px-1.5 text-xs font-medium transition-colors",
            value === item.value
              ? "bg-background text-foreground shadow-xs"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {item.label}
          {item.count ? (
            <span
              className={cx(
                "min-w-4 rounded-full px-1 text-2xs leading-4",
                item.tone ? TONES[item.tone] : "bg-secondary text-secondary-foreground",
              )}
            >
              {item.count}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

export function Swatch({ color, className }: { color: string; className?: string }) {
  return (
    <span
      className={cx("inline-block size-3.5 shrink-0 rounded-[4px] border border-overlay-10", className)}
      style={{
        background: `linear-gradient(${color}, ${color}), repeating-conic-gradient(#ccc 0% 25%, #fff 0% 50%) 50% / 6px 6px`,
      }}
    />
  );
}
