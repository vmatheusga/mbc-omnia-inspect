import { cleanOwners } from "../engine/identify";
import type { ReactInfo } from "../engine/types";
import {
  PROBE_ATTR,
  PROBE_REQUEST,
  PROBE_RESPONSE,
  type ProbeRequest,
  type ProbeResponse,
} from "./messages";

/** Escuta pedidos do content script e responde com o React Fiber do elemento. */
export function installProbeListener() {
  const w = window as unknown as { __omniaInspectProbe?: boolean };
  if (w.__omniaInspectProbe) return;
  w.__omniaInspectProbe = true;

  window.addEventListener("message", (event) => {
    const data = event.data as ProbeRequest | undefined;
    if (event.source !== window || data?.source !== PROBE_REQUEST) return;
    const el = findDeep(`[${PROBE_ATTR}="${CSS.escape(data.requestId)}"]`);
    const response: ProbeResponse = {
      source: PROBE_RESPONSE,
      requestId: data.requestId,
      info: el ? readFiber(el) : undefined,
    };
    window.postMessage(response, "*");
  });
}

/** Procura no documento e dentro das molduras do palco responsivo (mesma origem). */
function findDeep(selector: string): Element | null {
  const direct = document.querySelector(selector);
  if (direct) return direct;
  const frames = [
    ...document.querySelectorAll("iframe"),
    ...(document.querySelector("omnia-inspect-stage")?.shadowRoot?.querySelectorAll("iframe") ?? []),
  ];
  for (const frame of frames) {
    try {
      const found = frame.contentDocument?.querySelector(selector);
      if (found) return found;
    } catch {
      /* outra origem */
    }
  }
  return null;
}

type Fiber = {
  type: unknown;
  memoizedProps?: Record<string, unknown>;
  return: Fiber | null;
};

function componentName(type: unknown): string | undefined {
  if (!type) return undefined;
  if (typeof type === "function") {
    const fn = type as { displayName?: string; name?: string };
    return fn.displayName || fn.name || undefined;
  }
  if (typeof type === "object") {
    const obj = type as { displayName?: string; render?: unknown; type?: unknown };
    return obj.displayName || componentName(obj.render) || componentName(obj.type);
  }
  return undefined;
}

function serializableProps(props: Record<string, unknown> | undefined) {
  const out: Record<string, string | number | boolean | null> = {};
  if (!props) return out;
  for (const [key, value] of Object.entries(props)) {
    if (["children", "className", "style", "ref", "key"].includes(key) || /^on[A-Z]/.test(key)) continue;
    if (value === null || ["string", "number", "boolean"].includes(typeof value)) {
      out[key] = value as string | number | boolean | null;
    }
    if (Object.keys(out).length >= 24) break;
  }
  return out;
}

export function readFiber(el: Element): ReactInfo | undefined {
  const key = Object.keys(el).find(
    (k) => k.startsWith("__reactFiber$") || k.startsWith("__reactInternalInstance$"),
  );
  if (!key) return undefined;
  let fiber = (el as unknown as Record<string, Fiber>)[key]?.return ?? null;
  // `rootOf`: o elemento é o nó raiz renderizado pelo componente (nenhum outro
  // elemento host entre eles). Um <span> dentro de <Button> não é "o Button".
  const components: Array<{ name: string; props: Record<string, unknown> | undefined; rootOf: boolean }> = [];
  let crossedHost = false;
  let guard = 0;
  while (fiber && components.length < 25 && guard++ < 400) {
    if (typeof fiber.type === "string") crossedHost = true;
    else {
      const name = componentName(fiber.type);
      if (name) components.push({ name, props: fiber.memoizedProps, rootOf: !crossedHost });
    }
    fiber = fiber.return;
  }
  const cleaned = new Set(cleanOwners(components.map((c) => c.name)));
  const relevant = components.filter((c) => cleaned.has(c.name));
  const owner = relevant.find((c) => c.rootOf);
  return {
    name: owner?.name,
    props: owner ? serializableProps(owner.props) : undefined,
    owners: [...new Set(relevant.filter((c) => c.name !== owner?.name).map((c) => c.name))].slice(0, 10),
  };
}
