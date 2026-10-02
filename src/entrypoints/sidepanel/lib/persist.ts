import { useCallback, useState } from "react";

function read<T>(key: string, initial: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return initial;
    const value = JSON.parse(raw) as T;
    // objetos: mantém campos novos que ainda não estavam salvos
    if (value && typeof value === "object" && !Array.isArray(value) && initial && typeof initial === "object") {
      return { ...initial, ...value };
    }
    return value;
  } catch {
    return initial;
  }
}

/** useState lembrado entre aberturas do painel (localStorage; sem storage, só memória). */
export function usePersisted<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => read(key, initial));
  const update = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const resolved = typeof next === "function" ? (next as (p: T) => T)(prev) : next;
        try {
          localStorage.setItem(key, JSON.stringify(resolved));
        } catch {
          /* sem storage */
        }
        return resolved;
      });
    },
    [key],
  );
  return [value, update] as const;
}
