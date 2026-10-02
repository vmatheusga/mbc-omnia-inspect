import {
  Camera,
  Check,
  Copy,
  Download,
  History,
  ImageOff,
  LayoutGrid,
  Loader2,
  Rows3,
  Trash2,
  Video,
  X,
} from "lucide-react";
import { StrictMode, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { copyImage, exportShot, sessionZip, type ExportLook } from "../../shared/capture-export";
import { THEME_LABEL, videoFilename } from "../../shared/capture-plan";
import {
  deleteSession,
  getSession,
  listSessions,
  type CaptureSession,
  type StoredShot,
} from "../../shared/capture-store";
import { FRAME_LABEL, frameLayout, resolveFrame, type FrameBackground } from "../../shared/device-frames";
import { videoToGif } from "../../shared/gif";
import type { FrameMode } from "../../shared/messages";
import { currentBreakpoint } from "../../engine/tailwind";
import { Badge, Button, IconButton, cx } from "../sidepanel/components/ui";
import "./style.css";

const media = window.matchMedia("(prefers-color-scheme: dark)");
const applyTheme = () => document.documentElement.classList.toggle("dark", media.matches);
applyTheme();
media.addEventListener("change", applyTheme);

const ZOOMS = [0.25, 0.4, 0.5, 0.75, 1];
const AREA_LABEL = { viewport: "viewport", full: "página inteira", element: "elemento" } as const;

async function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  await chrome.downloads.download({ url, filename: `omnia-inspect/${filename}`, conflictAction: "uniquify" });
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

const fmtSize = (bytes: number) =>
  bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

const fmtDuration = (ms: number) => {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

function selectField<T extends string | number>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: string }>;
}) {
  return (
    <label className="flex items-center gap-2 text-xs text-muted-foreground">
      {label}
      <select
        value={String(value)}
        onChange={(e) => onChange(options.find((o) => String(o.value) === e.target.value)!.value)}
        className="h-8 rounded-sm border border-input bg-input-background px-2 text-xs text-foreground"
      >
        {options.map((o) => (
          <option key={String(o.value)} value={String(o.value)}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

// ---------------------------------------------------------------------------

function App() {
  const [id, setId] = useState(() => new URLSearchParams(location.search).get("id"));
  const [session, setSession] = useState<CaptureSession | null | undefined>(undefined);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<CaptureSession[]>([]);

  const refreshHistory = () => listSessions().then(setHistory).catch(() => setHistory([]));

  useEffect(() => {
    let alive = true;
    (async () => {
      const found = id ? await getSession(id) : (await listSessions())[0];
      if (alive) setSession(found ?? null);
    })().catch(() => alive && setSession(null));
    void refreshHistory();
    return () => {
      alive = false;
    };
  }, [id]);

  const open = (next: string) => {
    setHistoryOpen(false);
    window.history.replaceState(null, "", `?id=${next}`);
    setSession(undefined);
    setId(next);
  };

  useEffect(() => {
    document.title = session
      ? `${session.kind === "video" ? "Vídeo" : "Capturas"} · ${session.title || "Omnia Inspect"}`
      : "Capturas · Omnia Inspect";
  }, [session]);

  if (session === undefined) {
    return (
      <div className="flex h-screen items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Carregando…
      </div>
    );
  }

  const historyButton = (
    <Button variant="outline" onClick={() => setHistoryOpen(true)}>
      <History /> Histórico {history.length ? `(${history.length})` : ""}
    </Button>
  );

  return (
    <>
      {!session ? (
        <div className="flex h-screen flex-col items-center justify-center gap-3 px-6 text-center">
          <p className="text-base font-semibold">Nenhuma captura encontrada</p>
          <p className="text-sm text-muted-foreground">
            No painel do Omnia Inspect, abra a aba Capturar para tirar prints ou gravar um vídeo.
          </p>
          {history.length > 0 && historyButton}
        </div>
      ) : session.kind === "video" ? (
        <VideoPage session={session} historyButton={historyButton} />
      ) : (
        <PrintsPage session={session} historyButton={historyButton} />
      )}

      {historyOpen && (
        <div className="fixed inset-0 z-30 flex justify-end bg-overlay-40" onClick={() => setHistoryOpen(false)}>
          <aside
            className="flex h-full w-[380px] max-w-full flex-col border-l border-border bg-background"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="flex items-center justify-between border-b border-border px-4 py-3">
              <div>
                <p className="text-sm font-semibold">Histórico</p>
                <p className="text-2xs text-muted-foreground">As 10 últimas capturas ficam salvas neste navegador.</p>
              </div>
              <IconButton title="Fechar" onClick={() => setHistoryOpen(false)}>
                <X />
              </IconButton>
            </header>
            <ul className="flex-1 overflow-y-auto p-2">
              {history.map((item) => (
                <li key={item.id} className="group flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => open(item.id)}
                    className={cx(
                      "flex min-w-0 flex-1 items-center gap-3 rounded-sm px-2 py-2 text-left hover:bg-accent",
                      item.id === session?.id && "bg-accent",
                    )}
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-sm bg-muted">
                      {item.kind === "video" ? <Video className="size-4" /> : <Camera className="size-4" />}
                    </span>
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-xs font-medium">{item.title || item.url}</span>
                      <span className="truncate text-2xs text-muted-foreground">
                        {new Date(item.createdAt).toLocaleString("pt-BR")} ·{" "}
                        {item.kind === "video"
                          ? `vídeo ${fmtDuration(item.video?.durationMs ?? 0)}`
                          : `${item.shots?.length ?? 0} imagens`}
                      </span>
                    </span>
                  </button>
                  <IconButton
                    title="Apagar"
                    className="opacity-0 group-hover:opacity-100"
                    onClick={async () => {
                      await deleteSession(item.id);
                      const rest = history.filter((h) => h.id !== item.id);
                      setHistory(rest);
                      if (item.id === session?.id) {
                        if (rest[0]) open(rest[0].id);
                        else setSession(null);
                      }
                    }}
                  >
                    <Trash2 />
                  </IconButton>
                </li>
              ))}
              {!history.length && <li className="px-2 py-6 text-center text-xs text-muted-foreground">Nada por aqui.</li>}
            </ul>
          </aside>
        </div>
      )}
    </>
  );
}

function PageHeader({
  session,
  subtitle,
  children,
}: {
  session: CaptureSession;
  subtitle: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <header className="sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-border bg-background px-6 py-3">
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-lg font-semibold leading-tight">{session.title || "Capturas"}</h1>
        <p className="truncate text-xs text-muted-foreground">
          {session.url} · {new Date(session.createdAt).toLocaleString("pt-BR")} · {subtitle}
        </p>
      </div>
      {children}
    </header>
  );
}

// ---------------------------------------------------------------------------
// Prints
// ---------------------------------------------------------------------------

function useObjectUrl(blob: Blob | null | undefined) {
  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : null), [blob]);
  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url]);
  return url;
}

function PrintsPage({ session, historyButton }: { session: CaptureSession; historyButton: React.ReactNode }) {
  const shots = session.shots ?? [];
  const [zoom, setZoom] = useState(0.4);
  const [frame, setFrame] = useState<FrameMode>(session.frame ?? "none");
  const [background, setBackground] = useState<FrameBackground>("transparent");
  const [layout, setLayout] = useState<"row" | "grid">("row");
  const [open, setOpen] = useState<StoredShot | null>(null);
  const [zipping, setZipping] = useState(false);
  const look: ExportLook = { frame, background };
  const themes = [...new Set(shots.map((s) => s.theme))];
  const groups = themes.map((theme) => ({ theme, shots: shots.filter((s) => s.theme === theme) }));

  return (
    <div className="flex min-h-screen flex-col">
      <PageHeader
        session={session}
        subtitle={
          <>
            {AREA_LABEL[session.area ?? "viewport"]}
            {session.element ? ` (${session.element})` : ""} · {shots.length} {shots.length === 1 ? "imagem" : "imagens"}
          </>
        }
      >
        {selectField({
          label: "Zoom",
          value: zoom,
          onChange: setZoom,
          options: ZOOMS.map((z) => ({ value: z, label: `${Math.round(z * 100)}%` })),
        })}
        {selectField<FrameMode>({
          label: "Moldura",
          value: frame,
          onChange: setFrame,
          options: (["none", "auto", "phone", "tablet", "browser"] as FrameMode[]).map((v) => ({ value: v, label: FRAME_LABEL[v] })),
        })}
        {frame !== "none" &&
          selectField<FrameBackground>({
            label: "Fundo",
            value: background,
            onChange: setBackground,
            options: [
              { value: "transparent", label: "Transparente" },
              { value: "white", label: "Branco" },
              { value: "gray", label: "Cinza" },
            ],
          })}
        <div className="flex rounded-sm border border-input">
          <IconButton title="Em linha" active={layout === "row"} onClick={() => setLayout("row")}>
            <Rows3 />
          </IconButton>
          <IconButton title="Em grade" active={layout === "grid"} onClick={() => setLayout("grid")}>
            <LayoutGrid />
          </IconButton>
        </div>
        {historyButton}
        <Button
          variant="info"
          disabled={zipping}
          onClick={async () => {
            setZipping(true);
            try {
              const zip = await sessionZip(session, look);
              await download(zip.blob, zip.filename);
            } finally {
              setZipping(false);
            }
          }}
        >
          {zipping ? <Loader2 className="animate-spin" /> : <Download />} Baixar todas (.zip)
        </Button>
      </PageHeader>

      <main className="flex flex-1 flex-col gap-8 p-6">
        {groups.map((group) => (
          <section key={group.theme ?? "atual"} className="flex flex-col gap-3">
            {themes.length > 1 && group.theme && (
              <h2 className="text-sm font-semibold">Tema {THEME_LABEL[group.theme]}</h2>
            )}
            <div className={cx("flex items-start gap-6", layout === "row" ? "overflow-x-auto pb-2" : "flex-wrap")}>
              {group.shots.map((shot) => (
                <ShotCard key={shot.id} session={session} shot={shot} look={look} zoom={zoom} onOpen={() => setOpen(shot)} />
              ))}
            </div>
          </section>
        ))}
      </main>

      {open && <Lightbox session={session} shot={open} look={look} onClose={() => setOpen(null)} />}
    </div>
  );
}

/** A imagem final (com moldura) do print, recalculada quando a moldura muda. */
function useExported(session: CaptureSession, shot: StoredShot, look: ExportLook) {
  const [blob, setBlob] = useState<Blob | null>(shot.blob);
  useEffect(() => {
    let alive = true;
    exportShot(session, shot, look).then((out) => alive && setBlob(out?.blob ?? null));
    return () => {
      alive = false;
    };
  }, [session, shot, look.frame, look.background]);
  return blob;
}

function ShotCard({
  session,
  shot,
  look,
  zoom,
  onOpen,
}: {
  session: CaptureSession;
  shot: StoredShot;
  look: ExportLook;
  zoom: number;
  onOpen: () => void;
}) {
  const blob = useExported(session, shot, look);
  const url = useObjectUrl(blob);
  const [copied, setCopied] = useState(false);
  const kind = resolveFrame(look.frame, shot.viewport.width);
  const cssWidth = kind ? frameLayout(kind, shot.width, shot.height, 1).width : shot.width;

  return (
    <figure className="flex shrink-0 flex-col gap-2" style={{ width: Math.max(160, cssWidth * zoom) }}>
      <figcaption className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 truncate text-sm font-semibold">
            {shot.viewport.label}
            <Badge tone="outline" className="font-mono">
              {currentBreakpoint(shot.viewport.width)}
            </Badge>
          </p>
          <p className="truncate font-mono text-2xs text-muted-foreground">
            {shot.width} × {shot.height}
            {shot.dpr > 1 ? ` @${shot.dpr}x` : ""}
            {shot.truncated ? " · cortada (página muito alta)" : ""}
          </p>
        </div>
        {shot.blob && (
          <div className="flex shrink-0">
            <IconButton
              title="Copiar imagem"
              onClick={async () => {
                if (!blob) return;
                await copyImage(blob);
                setCopied(true);
                setTimeout(() => setCopied(false), 1200);
              }}
            >
              {copied ? <Check className="text-success" /> : <Copy />}
            </IconButton>
            <IconButton
              title="Baixar esta imagem"
              onClick={async () => {
                const out = await exportShot(session, shot, look);
                if (out) await download(out.blob, out.filename);
              }}
            >
              <Download />
            </IconButton>
          </div>
        )}
      </figcaption>
      {shot.blob ? (
        <button
          type="button"
          onClick={onOpen}
          className={cx(
            "overflow-hidden rounded-md transition-shadow hover:shadow-md",
            !kind && "border border-border bg-background shadow-sm",
          )}
          title="Ver em tamanho real"
        >
          {url ? (
            <img src={url} alt={`${shot.viewport.label} ${shot.width}×${shot.height}`} className="block h-auto w-full" />
          ) : (
            <div className="flex aspect-video items-center justify-center">
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            </div>
          )}
        </button>
      ) : (
        <div className="flex aspect-[3/4] flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
          <ImageOff className="size-5" />
          O elemento não aparece neste tamanho.
        </div>
      )}
    </figure>
  );
}

function Lightbox({
  session,
  shot,
  look,
  onClose,
}: {
  session: CaptureSession;
  shot: StoredShot;
  look: ExportLook;
  onClose: () => void;
}) {
  const url = useObjectUrl(useExported(session, shot, look));
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-20 flex flex-col bg-overlay-80" onClick={onClose} role="dialog" aria-label={shot.viewport.label}>
      <div className="flex items-center justify-between px-6 py-3 text-white">
        <span className="text-sm font-medium">
          {shot.viewport.label} · {shot.width} × {shot.height}
          {shot.theme ? ` · ${THEME_LABEL[shot.theme]}` : ""}
        </span>
        <IconButton className="text-white hover:bg-white/10" title="Fechar" onClick={onClose}>
          <X />
        </IconButton>
      </div>
      <div className="flex-1 overflow-auto px-6 pb-6">
        {url && (
          <img
            src={url}
            alt=""
            className="mx-auto block max-w-none"
            onLoad={(e) => {
              const img = e.currentTarget;
              img.style.width = `${img.naturalWidth / shot.dpr}px`;
            }}
            onClick={(e) => e.stopPropagation()}
          />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Vídeo
// ---------------------------------------------------------------------------

function VideoPage({ session, historyButton }: { session: CaptureSession; historyButton: React.ReactNode }) {
  const video = session.video!;
  const url = useObjectUrl(video.blob);
  const ext = video.mime.includes("webm") ? "webm" : "mp4";
  const widths = [480, 640, 800].filter((w) => w < video.width).concat(video.width <= 1280 ? [video.width] : []);
  const [gifWidth, setGifWidth] = useState(widths.includes(640) ? 640 : widths[widths.length - 1]);
  const [gifFps, setGifFps] = useState(12);
  const [gifProgress, setGifProgress] = useState<number | null>(null);
  const [gifResult, setGifResult] = useState<{ size: number } | null>(null);
  const [error, setError] = useState<string>();

  return (
    <div className="flex min-h-screen flex-col">
      <PageHeader
        session={session}
        subtitle={
          <>
            vídeo {fmtDuration(video.durationMs)} · {video.viewport.label} {video.width} × {video.height}
            {video.theme ? ` · ${THEME_LABEL[video.theme]}` : ""}
          </>
        }
      >
        {historyButton}
        <Button
          variant="info"
          onClick={() => download(video.blob, videoFilename(session.url, video.viewport, ext, session.createdAt))}
        >
          <Download /> Baixar {ext.toUpperCase()} · {fmtSize(video.blob.size)}
        </Button>
      </PageHeader>

      <main className="flex flex-1 flex-col items-center gap-6 p-6 lg:flex-row lg:items-start lg:justify-center">
        <div className="overflow-hidden rounded-md border border-border bg-black shadow-sm">
          {url && (
            <video
              src={url}
              controls
              autoPlay
              muted
              loop
              className="block max-h-[78vh] max-w-full"
              style={{ width: video.width, maxWidth: "min(100%, 1200px)" }}
            />
          )}
        </div>

        <aside className="flex w-full max-w-80 flex-col gap-4 rounded-md border border-border bg-card p-4">
          <div>
            <p className="text-sm font-semibold">Exportar GIF</p>
            <p className="text-xs text-muted-foreground">
              Bom para PRs e documentação. O GIF fica mais pesado e com menos cores que o vídeo.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            {selectField({
              label: "Largura",
              value: gifWidth,
              onChange: setGifWidth,
              options: widths.map((w) => ({ value: w, label: `${w} px${w === video.width ? " (original)" : ""}` })),
            })}
            {selectField({
              label: "Quadros/s",
              value: gifFps,
              onChange: setGifFps,
              options: [8, 12, 15].map((f) => ({ value: f, label: String(f) })),
            })}
          </div>
          {gifProgress !== null ? (
            <div className="flex flex-col gap-1.5">
              <span className="flex items-center gap-1.5 text-xs">
                <Loader2 className="size-3.5 animate-spin" /> Gerando GIF… {Math.round(gifProgress * 100)}%
              </span>
              <div className="h-1 overflow-hidden rounded-full bg-muted">
                <div className="h-full bg-info transition-[width]" style={{ width: `${gifProgress * 100}%` }} />
              </div>
            </div>
          ) : (
            <Button
              variant="outline"
              onClick={async () => {
                setError(undefined);
                setGifResult(null);
                setGifProgress(0);
                try {
                  const gif = await videoToGif(
                    video.blob,
                    { width: gifWidth, fps: gifFps, durationMs: video.durationMs },
                    setGifProgress,
                  );
                  setGifResult({ size: gif.size });
                  await download(gif, videoFilename(session.url, video.viewport, "gif", session.createdAt));
                } catch (e) {
                  setError(String((e as Error)?.message ?? e));
                } finally {
                  setGifProgress(null);
                }
              }}
            >
              <Download /> Gerar e baixar GIF
            </Button>
          )}
          {gifResult && <p className="text-xs text-success">GIF salvo · {fmtSize(gifResult.size)}</p>}
          {error && <p className="text-xs text-destructive">{error}</p>}
        </aside>
      </main>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
