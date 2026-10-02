/**
 * Sessões de captura (prints e vídeos) em IndexedDB. O banco é da origem da
 * extensão, então o background, o documento offscreen, o painel e a galeria
 * leem e gravam no mesmo lugar, e as capturas sobrevivem ao service worker
 * reiniciar.
 */
import type { FrameMode, ImageFormat, ShotArea, Theme, ViewportSpec } from "./messages";

export interface StoredShot {
  id: string;
  viewport: ViewportSpec;
  /** null: tema atual da página. */
  theme: Theme | null;
  /** Tamanho em px CSS. */
  width: number;
  height: number;
  dpr: number;
  /** null: o elemento não aparece neste tamanho. */
  blob: Blob | null;
  /** Página mais alta que o limite: a imagem foi cortada. */
  truncated?: boolean;
}

export interface StoredVideo {
  blob: Blob;
  mime: string;
  width: number;
  height: number;
  durationMs: number;
  /** Quadros codificados (taxa efetiva = frames / duração). */
  frames: number;
  viewport: ViewportSpec;
  theme: Theme | null;
}

export interface CaptureSession {
  id: string;
  kind: "prints" | "video";
  url: string;
  title: string;
  createdAt: string;
  area?: ShotArea;
  format?: ImageFormat;
  frame?: FrameMode;
  /** Nome do elemento capturado (área "elemento"). */
  element?: string;
  shots?: StoredShot[];
  video?: StoredVideo;
}

const DB = "omnia-inspect-captures";
const STORE = "sessions";
export const KEEP_SESSIONS = 10;

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      const store = req.result.createObjectStore(STORE, { keyPath: "id" });
      store.createIndex("createdAt", "createdAt");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T> | void): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const req = run(t.objectStore(STORE));
      t.oncomplete = () => resolve(req ? req.result : (undefined as T));
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  } finally {
    db.close();
  }
}

export const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export async function saveSession(session: CaptureSession) {
  await tx("readwrite", (store) => store.put(session));
  await pruneSessions();
}

export function getSession(id: string): Promise<CaptureSession | undefined> {
  return tx("readonly", (store) => store.get(id) as IDBRequest<CaptureSession | undefined>);
}

/** Mais recentes primeiro. */
export async function listSessions(): Promise<CaptureSession[]> {
  const all = await tx("readonly", (store) => store.getAll() as IDBRequest<CaptureSession[]>);
  return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function deleteSession(id: string) {
  return tx("readwrite", (store) => store.delete(id));
}

async function pruneSessions() {
  const all = await listSessions();
  for (const old of all.slice(KEEP_SESSIONS)) await deleteSession(old.id);
}
