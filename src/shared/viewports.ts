import type { ViewportSpec } from "./messages";

export const DEVICE_PRESETS: ViewportSpec[] = [
  { id: "mobile-s", label: "Mobile S", width: 320, height: 568, mobile: true },
  { id: "mobile-m", label: "Mobile M", width: 375, height: 812, mobile: true },
  { id: "mobile-l", label: "Mobile L", width: 430, height: 932, mobile: true },
  { id: "tablet", label: "Tablet", width: 768, height: 1024, mobile: true },
  { id: "tablet-l", label: "Tablet paisagem", width: 1024, height: 768, mobile: true },
  { id: "laptop", label: "Laptop", width: 1280, height: 800, mobile: false },
  { id: "laptop-l", label: "Laptop L", width: 1440, height: 900, mobile: false },
  { id: "desktop", label: "Desktop Full HD", width: 1920, height: 1080, mobile: false },
];

/** Breakpoints do Tailwind v4 (min-width). Altura = a da aba. */
export const BREAKPOINT_PRESETS: ViewportSpec[] = [
  { id: "bp-sm", label: "sm", width: 640, mobile: false },
  { id: "bp-md", label: "md", width: 768, mobile: false },
  { id: "bp-lg", label: "lg", width: 1024, mobile: false },
  { id: "bp-xl", label: "xl", width: 1280, mobile: false },
  { id: "bp-2xl", label: "2xl", width: 1536, mobile: false },
];

export const DEFAULT_COMPARE = ["mobile-m", "tablet", "laptop", "desktop"];

export function rotate(spec: ViewportSpec): ViewportSpec {
  if (!spec.height) return spec;
  return { ...spec, id: `${spec.id}-rot`, width: spec.height, height: spec.width };
}

export function deviceKind(width: number): "mobile" | "tablet" | "desktop" {
  if (width < 640) return "mobile";
  if (width < 1100) return "tablet";
  return "desktop";
}

/** base…2xl, com base = 375px (abaixo de sm). */
export const BREAKPOINT_SPECS: ViewportSpec[] = [
  { id: "bp-base", label: "base", width: 375, height: 812, mobile: true },
  ...BREAKPOINT_PRESETS,
];

/** Tamanho personalizado com id estável (`custom-390x844`). */
export function customSpec(width: number, height: number): ViewportSpec {
  return { id: `custom-${width}x${height}`, label: `${width} × ${height}`, width, height, mobile: width < 1024 };
}

export const sameSize = (a: { width: number; height?: number }, b: { width: number; height?: number }) =>
  a.width === b.width && (a.height ?? 0) === (b.height ?? 0);
