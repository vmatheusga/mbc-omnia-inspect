import {
  Camera,
  ChevronDown,
  Circle,
  ExternalLink,
  Loader2,
  Pause,
  Play,
  RotateCw,
  Square,
  TriangleAlert,
  Video,
} from "lucide-react";
import { useEffect, useState } from "react";
import { copyImage, exportShot, sessionZip } from "../../../shared/capture-export";
import { planShots } from "../../../shared/capture-plan";
import { getSession } from "../../../shared/capture-store";
import type {
  AutoscrollOptions,
  FrameMode,
  ImageFormat,
  RecordOptions,
  RecordingState,
  ShotArea,
  ShotOptions,
  ThemeChoice,
  ViewportSpec,
} from "../../../shared/messages";
import { BREAKPOINT_SPECS, customSpec, rotate } from "../../../shared/viewports";
import { usePersisted } from "../lib/persist";
import type { Inspector } from "../useInspector";
import { DeviceIcon, SizePicker, dims, sizeRegistry } from "./SizePicker";
import { Button, Section, Tabs, cx } from "./ui";

type Mode = "shots" | "video";
type After = "gallery" | "download" | "copy";

const SHOT_DEFAULTS = {
  area: "viewport" as ShotArea,
  theme: "current" as ThemeChoice,
  forceDarkClass: true,
  format: "png" as ImageFormat,
  dpr: 1 as 1 | 2 | 3,
  padding: 16,
  lazy: true,
  freeze: true,
  hideScrollbars: true,
  expandInner: true,
  delayMs: 700,
  frame: "none" as FrameMode,
  after: "gallery" as After,
};

const AUTOSCROLL_DEFAULTS: AutoscrollOptions = {
  speed: 250,
  direction: "down",
  easing: true,
  startPauseMs: 1000,
  endPauseMs: 1500,
  stopAtEnd: true,
};

const VIDEO_DEFAULTS = {
  theme: "current" as RecordOptions["theme"],
  forceDarkClass: true,
  fps: 30 as 30 | 60,
  format: "mp4" as "mp4" | "webm",
  toTop: true,
  lazy: true,
  countdown: true,
  hideScrollbars: true,
  autoscrollOn: true,
  autoscroll: AUTOSCROLL_DEFAULTS,
  maxMs: 60_000 as number | null,
  landscape: false,
};

const SPEEDS = [
  { label: "Lento", value: 100 },
  { label: "Médio", value: 250 },
  { label: "Rápido", value: 500 },
];

// ---------------------------------------------------------------------------
// Peças de formulário
// ---------------------------------------------------------------------------

function Check({
  checked,
  onChange,
  children,
  hint,
  disabled,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  children: React.ReactNode;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <label className={cx("flex items-start gap-2 text-xs", disabled && "opacity-50")}>
      <input
        type="checkbox"
        className="mt-0.5 accent-[var(--info)]"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="flex flex-col">
        {children}
        {hint && <span className="text-2xs text-muted-foreground">{hint}</span>}
      </span>
    </label>
  );
}

function Choice<T extends string | number>({
  label,
  value,
  onChange,
  options,
}: {
  label?: string;
  value: T;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: string }>;
}) {
  return (
    <div className="flex flex-col gap-1">
      {label && <span className="text-2xs text-muted-foreground">{label}</span>}
      <Tabs<string>
        value={String(value)}
        onChange={(v) => onChange(options.find((o) => String(o.value) === v)!.value)}
        items={options.map((o) => ({ value: String(o.value), label: o.label }))}
      />
    </div>
  );
}

function Collapsible({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center justify-between text-2xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
      >
        {title}
        <ChevronDown className={cx("size-3.5 transition-transform", open && "rotate-180")} />
      </button>
      {open && <div className="flex flex-col gap-2.5">{children}</div>}
    </div>
  );
}

function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-1.5 rounded-sm bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
      <TriangleAlert className="mt-px size-3.5 shrink-0" /> {children}
    </p>
  );
}

const fmtTime = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

function useNow(active: boolean) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

const elapsedOf = (state: RecordingState, now: number) =>
  state.startedAt ? now - state.startedAt - state.pausedMs - (state.pausedAt ? now - state.pausedAt : 0) : 0;

// ---------------------------------------------------------------------------

export function CaptureView({ inspector }: { inspector: Inspector }) {
  const { capture } = inspector;
  const [mode, setMode] = usePersisted<Mode>("omnia-inspect:capture-mode", "shots");
  const [customs, setCustoms] = usePersisted<ViewportSpec[]>("omnia-inspect:capture-customs", []);
  const [shotSizes, setShotSizes] = usePersisted<string[]>("omnia-inspect:capture-sizes", BREAKPOINT_SPECS.map((b) => b.id));
  const [videoSize, setVideoSize] = usePersisted<string>("omnia-inspect:video-size", "mobile-m");
  const [shot, setShot] = usePersisted("omnia-inspect:capture-options", SHOT_DEFAULTS);
  const [video, setVideo] = usePersisted("omnia-inspect:video-options", VIDEO_DEFAULTS);
  const [fromStage, setFromStage] = useState<number | null>(null);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();

  const registry = sizeRegistry(customs);
  const shotSpecs = shotSizes.map((id) => registry.get(id)).filter((s): s is ViewportSpec => !!s);
  const videoSpec = registry.get(videoSize) ?? null;
  const recordingSpec = videoSpec && video.landscape && videoSpec.height ? rotate(videoSpec) : videoSpec;

  const buildRecordOptions = (): RecordOptions | null =>
    recordingSpec && {
      size: recordingSpec,
      theme: video.theme,
      forceDarkClass: video.forceDarkClass,
      fps: video.fps,
      format: video.format,
      toTop: video.toTop,
      lazy: video.lazy,
      countdown: video.countdown,
      hideScrollbars: video.hideScrollbars,
      autoscroll: video.autoscrollOn ? video.autoscroll : null,
      maxMs: video.maxMs,
    };

  const startRecording = async () => {
    const options = buildRecordOptions();
    if (!options) return setError("Escolha um tamanho para gravar.");
    setError(undefined);
    const res = await capture.startRecording(options);
    if (!res.ok) setError(res.error);
  };

  // Pedidos de fora: botão do palco (prints) e atalho Alt+Shift+R (gravar)
  const request = capture.request;
  useEffect(() => {
    if (!request) return;
    capture.clearRequest();
    if (request.kind === "shots") {
      const known = sizeRegistry(customs);
      const extra: ViewportSpec[] = [];
      const ids = request.devices.map((d) => {
        if (known.has(d.id)) return d.id;
        const spec = customSpec(d.width, d.height ?? 800);
        if (!known.has(spec.id)) extra.push(spec);
        return spec.id;
      });
      if (extra.length) setCustoms([...customs, ...extra]);
      setShotSizes([...new Set(ids)]);
      setMode("shots");
      setFromStage(ids.length);
    } else {
      setMode("video");
      if (capture.recording.status === "idle") void startRecording();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request]);

  if (!capture.supported) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
        <Camera className="size-7 text-muted-foreground" />
        <p className="text-sm font-medium">Prints e vídeos</p>
        <p className="text-xs text-muted-foreground">Disponível apenas na extensão instalada.</p>
      </main>
    );
  }

  if (capture.recording.status !== "idle") return <RecordingPanel inspector={inspector} />;

  const total = planShots(shotSpecs, shot.theme).length;
  const progress = capture.progress;
  const elementName = inspector.result?.component.name;

  const runShots = async () => {
    setError(undefined);
    setNotice(undefined);
    const options: ShotOptions = {
      sizes: shotSpecs,
      area: shot.area,
      theme: shot.theme,
      forceDarkClass: shot.forceDarkClass,
      format: shot.format,
      dpr: shot.dpr,
      padding: shot.padding,
      lazy: shot.lazy,
      freeze: shot.freeze,
      hideScrollbars: shot.hideScrollbars,
      expandInner: shot.expandInner,
      delayMs: shot.delayMs,
      frame: shot.frame,
      openGallery: shot.after === "gallery" || (shot.after === "copy" && total !== 1),
    };
    const res = await capture.runShots(options);
    if (!res.ok) return setError(res.error);
    if (options.openGallery) return;
    const session = await getSession(res.sessionId);
    if (!session) return setError("Captura não encontrada.");
    const look = { frame: shot.frame, background: "transparent" as const };
    try {
      if (shot.after === "copy") {
        const out = session.shots?.[0] && (await exportShot(session, session.shots[0], look));
        if (!out) return setError("O elemento não aparece neste tamanho.");
        await copyImage(out.blob);
        setNotice("Imagem copiada. Cole com ⌘V / Ctrl+V.");
      } else {
        const ready = (session.shots ?? []).filter((s) => s.blob);
        if (ready.length === 1) {
          const out = (await exportShot(session, ready[0], look))!;
          await inspector.download({ filename: `omnia-inspect/${out.filename}`, blob: out.blob });
        } else {
          const zip = await sessionZip(session, look);
          await inspector.download({ filename: `omnia-inspect/${zip.filename}`, blob: zip.blob });
        }
        setNotice(`${ready.length} ${ready.length === 1 ? "imagem salva" : "imagens salvas"} em Downloads/omnia-inspect.`);
      }
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <main className="flex flex-1 flex-col gap-5 overflow-y-auto p-3">
        <div role="tablist" className="flex gap-0.5 rounded-sm bg-muted p-0.5">
          {(
            [
              { value: "shots", label: "Print", icon: Camera },
              { value: "video", label: "Vídeo", icon: Video },
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

        {mode === "shots" ? (
          <>
            <SizePicker
              multiple
              selected={shotSizes}
              onChange={(ids) => {
                setShotSizes(ids);
                setFromStage(null);
              }}
              customs={customs}
              onCustomsChange={setCustoms}
              note={
                fromStage ? (
                  <p className="rounded-sm bg-info-subtle px-2 py-1.5 text-2xs text-info-subtle-foreground">
                    Usando os {fromStage} tamanhos abertos no Responsivo.
                  </p>
                ) : undefined
              }
            />

            <Section title="Área">
              <Choice
                value={shot.area}
                onChange={(area) => setShot((o) => ({ ...o, area }))}
                options={[
                  { value: "viewport", label: "Viewport" },
                  { value: "full", label: "Página inteira" },
                  { value: "element", label: "Elemento" },
                ]}
              />
              <p className="text-2xs text-muted-foreground">
                {shot.area === "viewport" && "O que cabe na tela de cada tamanho, na posição de rolagem atual."}
                {shot.area === "full" && "A página do topo ao fim, inclusive o que está fora da tela."}
                {shot.area === "element" &&
                  (elementName ? (
                    <>
                      Recorta só <b className="text-foreground">{elementName}</b> em cada tamanho. Se ele sumir em algum
                      tamanho, a galeria avisa.
                    </>
                  ) : (
                    <span className="text-warning-subtle-foreground">
                      Selecione um elemento na aba Inspecionar para recortá-lo.
                    </span>
                  ))}
              </p>
              {shot.area === "element" && (
                <Choice
                  label="Respiro em volta"
                  value={shot.padding}
                  onChange={(padding) => setShot((o) => ({ ...o, padding }))}
                  options={[
                    { value: 0, label: "0" },
                    { value: 16, label: "16 px" },
                    { value: 32, label: "32 px" },
                  ]}
                />
              )}
            </Section>

            <Section title="Tema">
              <Choice
                value={shot.theme}
                onChange={(theme) => setShot((o) => ({ ...o, theme }))}
                options={[
                  { value: "current", label: "Atual" },
                  { value: "light", label: "Claro" },
                  { value: "dark", label: "Escuro" },
                  { value: "both", label: "Os dois" },
                ]}
              />
              {shot.theme !== "current" && (
                <Check
                  checked={shot.forceDarkClass}
                  onChange={(forceDarkClass) => setShot((o) => ({ ...o, forceDarkClass }))}
                  hint="Além do prefers-color-scheme, liga/desliga a classe .dark no <html> (Omnia e shadcn)."
                >
                  Aplicar a classe <code className="font-mono">.dark</code>
                </Check>
              )}
            </Section>

            <Section title="Imagem">
              <div className="grid grid-cols-2 gap-2">
                <Choice
                  label="Formato"
                  value={shot.format}
                  onChange={(format) => setShot((o) => ({ ...o, format }))}
                  options={[
                    { value: "png", label: "PNG" },
                    { value: "jpeg", label: "JPG" },
                    { value: "webp", label: "WebP" },
                  ]}
                />
                <Choice
                  label="Densidade"
                  value={shot.dpr}
                  onChange={(dpr) => setShot((o) => ({ ...o, dpr }))}
                  options={[
                    { value: 1, label: "1x" },
                    { value: 2, label: "2x" },
                    { value: 3, label: "3x" },
                  ]}
                />
              </div>
              <Choice
                label="Moldura de dispositivo"
                value={shot.frame === "none" ? "none" : "auto"}
                onChange={(frame) => setShot((o) => ({ ...o, frame }))}
                options={[
                  { value: "none", label: "Nenhuma" },
                  { value: "auto", label: "Celular · tablet · navegador" },
                ]}
              />
            </Section>

            <Collapsible title="Ajustes da captura">
              <Check
                checked={shot.freeze}
                onChange={(freeze) => setShot((o) => ({ ...o, freeze }))}
                hint="Leva animações e transições ao estado final."
              >
                Congelar animações
              </Check>
              <Check checked={shot.hideScrollbars} onChange={(hideScrollbars) => setShot((o) => ({ ...o, hideScrollbars }))}>
                Esconder barras de rolagem
              </Check>
              <Check
                checked={shot.lazy}
                disabled={shot.area !== "full"}
                onChange={(lazy) => setShot((o) => ({ ...o, lazy }))}
                hint="Rola até o fim antes, para carregar imagens com loading=lazy."
              >
                Carregar imagens lazy (página inteira)
              </Check>
              <Check
                checked={shot.expandInner}
                disabled={shot.area !== "full"}
                onChange={(expandInner) => setShot((o) => ({ ...o, expandInner }))}
                hint="Para apps em que quem rola é um painel, e não a página."
              >
                Expandir rolagem interna (página inteira)
              </Check>
              <Choice
                label="Esperar antes de cada print"
                value={shot.delayMs}
                onChange={(delayMs) => setShot((o) => ({ ...o, delayMs }))}
                options={[
                  { value: 300, label: "0,3 s" },
                  { value: 700, label: "0,7 s" },
                  { value: 1500, label: "1,5 s" },
                  { value: 3000, label: "3 s" },
                ]}
              />
            </Collapsible>

            <Section title="Ao terminar">
              <Choice
                value={shot.after === "copy" && total !== 1 ? "gallery" : shot.after}
                onChange={(after) => setShot((o) => ({ ...o, after }))}
                options={[
                  { value: "gallery", label: "Abrir galeria" },
                  { value: "download", label: total > 1 ? "Baixar .zip" : "Baixar" },
                  ...(total === 1 ? [{ value: "copy" as After, label: "Copiar" }] : []),
                ]}
              />
            </Section>
          </>
        ) : (
          <VideoForm
            inspector={inspector}
            customs={customs}
            setCustoms={setCustoms}
            videoSize={videoSize}
            setVideoSize={setVideoSize}
            spec={recordingSpec}
            video={video}
            setVideo={setVideo}
          />
        )}
      </main>

      <footer className="flex flex-col gap-2 border-t border-border bg-background p-3">
        {error && <ErrorNote>{error}</ErrorNote>}
        {!error && capture.recording.error && mode === "video" && <ErrorNote>{capture.recording.error}</ErrorNote>}
        {notice && <p className="text-xs text-success">{notice}</p>}
        {mode === "shots" ? (
          progress ? (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5">
                  <Loader2 className="size-3.5 animate-spin" /> {Math.min(progress.done + 1, progress.total)}/{progress.total} ·{" "}
                  {progress.label}
                </span>
                <button type="button" className="text-muted-foreground hover:text-foreground" onClick={capture.cancelShots}>
                  Cancelar
                </button>
              </div>
              <div className="h-1 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-info transition-[width]"
                  style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }}
                />
              </div>
            </div>
          ) : (
            <Button
              variant="info"
              className="h-9"
              disabled={!total || (shot.area === "element" && !elementName)}
              onClick={runShots}
            >
              <Camera />
              {total ? `Capturar ${total} ${total === 1 ? "imagem" : "imagens"}` : "Escolha ao menos um tamanho"}
            </Button>
          )
        ) : (
          <>
            <Button
              className="h-9 bg-destructive text-white hover:bg-destructive/90"
              disabled={!recordingSpec}
              onClick={startRecording}
            >
              <Circle className="fill-current" /> Gravar {recordingSpec ? dims(recordingSpec) : ""}
            </Button>
            <p className="text-center text-2xs text-muted-foreground">
              Atalho: <kbd className="font-mono">Alt</kbd> + <kbd className="font-mono">Shift</kbd> +{" "}
              <kbd className="font-mono">R</kbd> grava e para
            </p>
          </>
        )}
        {capture.recording.sessionId && mode === "video" && (
          <a
            className="flex items-center justify-center gap-1 text-2xs text-info hover:underline"
            href={chrome.runtime.getURL(`/compare.html?id=${capture.recording.sessionId}`)}
            target="_blank"
            rel="noreferrer"
          >
            Abrir o último vídeo <ExternalLink className="size-3" />
          </a>
        )}
      </footer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Vídeo
// ---------------------------------------------------------------------------

type VideoOptions = typeof VIDEO_DEFAULTS;

function VideoForm({
  customs,
  setCustoms,
  videoSize,
  setVideoSize,
  spec,
  video,
  setVideo,
}: {
  inspector: Inspector;
  customs: ViewportSpec[];
  setCustoms: (list: ViewportSpec[]) => void;
  videoSize: string;
  setVideoSize: (id: string) => void;
  spec: ViewportSpec | null;
  video: VideoOptions;
  setVideo: (fn: (o: VideoOptions) => VideoOptions) => void;
}) {
  const scroll = video.autoscroll;
  const setScroll = (change: Partial<AutoscrollOptions>) =>
    setVideo((o) => ({ ...o, autoscroll: { ...o.autoscroll, ...change } }));

  return (
    <>
      <SizePicker
        multiple={false}
        title="Tamanho do vídeo"
        selected={[videoSize]}
        onChange={(ids) => setVideoSize(ids[0])}
        customs={customs}
        onCustomsChange={setCustoms}
        note={
          spec && (
            <div className="flex items-center gap-2 rounded-sm border border-border bg-card px-2 py-1.5">
              <DeviceIcon width={spec.width} className="size-4 opacity-70" />
              <span className="flex-1 text-xs">
                Grava em <b className="font-mono">{dims(spec)}</b>
                {!spec.height && <span className="text-muted-foreground"> · altura da aba</span>}
              </span>
              {spec.height && (
                <Button variant="ghost" className="h-7 px-2" onClick={() => setVideo((o) => ({ ...o, landscape: !o.landscape }))}>
                  <RotateCw /> {video.landscape ? "Retrato" : "Paisagem"}
                </Button>
              )}
            </div>
          )
        }
      />

      <Section title="Auto scroll">
        <Check
          checked={video.autoscrollOn}
          onChange={(autoscrollOn) => setVideo((o) => ({ ...o, autoscrollOn }))}
          hint="A página rola sozinha, com velocidade constante, enquanto grava."
        >
          Rolar a página sozinho
        </Check>
        {video.autoscrollOn && (
          <div className="flex flex-col gap-3 rounded-sm border border-border p-2.5">
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-2xs text-muted-foreground">
                <span>Velocidade</span>
                <span className="font-mono text-foreground">{scroll.speed} px/s</span>
              </div>
              <input
                type="range"
                min={40}
                max={1200}
                step={10}
                value={scroll.speed}
                onChange={(e) => setScroll({ speed: Number(e.target.value) })}
                className="w-full accent-[var(--info)]"
                aria-label="Velocidade do auto scroll"
              />
              <div className="flex gap-1">
                {SPEEDS.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => setScroll({ speed: s.value })}
                    className={cx(
                      "flex-1 rounded-xs border px-1.5 py-0.5 text-2xs",
                      scroll.speed === s.value ? "border-info bg-info-subtle text-info-subtle-foreground" : "border-border hover:bg-accent",
                    )}
                  >
                    {s.label} · {s.value}
                  </button>
                ))}
              </div>
            </div>
            <Choice
              label="Direção"
              value={scroll.direction}
              onChange={(direction) => setScroll({ direction })}
              options={[
                { value: "down", label: "Só descer" },
                { value: "down-up", label: "Descer e voltar" },
              ]}
            />
            <div className="grid grid-cols-2 gap-2">
              <Choice
                label="Pausa no início"
                value={scroll.startPauseMs}
                onChange={(startPauseMs) => setScroll({ startPauseMs })}
                options={[
                  { value: 0, label: "0" },
                  { value: 1000, label: "1 s" },
                  { value: 2000, label: "2 s" },
                ]}
              />
              <Choice
                label="Pausa no fim"
                value={scroll.endPauseMs}
                onChange={(endPauseMs) => setScroll({ endPauseMs })}
                options={[
                  { value: 0, label: "0" },
                  { value: 1500, label: "1,5 s" },
                  { value: 3000, label: "3 s" },
                ]}
              />
            </div>
            <Check checked={scroll.easing} onChange={(easing) => setScroll({ easing })} hint="Acelera no começo e freia no fim.">
              Suavizar início e fim
            </Check>
            <Check checked={scroll.stopAtEnd} onChange={(stopAtEnd) => setScroll({ stopAtEnd })}>
              Parar a gravação quando terminar de rolar
            </Check>
          </div>
        )}
      </Section>

      <Section title="Tema">
        <Choice
          value={video.theme}
          onChange={(theme) => setVideo((o) => ({ ...o, theme }))}
          options={[
            { value: "current", label: "Atual" },
            { value: "light", label: "Claro" },
            { value: "dark", label: "Escuro" },
          ]}
        />
        {video.theme !== "current" && (
          <Check checked={video.forceDarkClass} onChange={(forceDarkClass) => setVideo((o) => ({ ...o, forceDarkClass }))}>
            Aplicar a classe <code className="font-mono">.dark</code>
          </Check>
        )}
      </Section>

      <Section title="Gravação">
        <div className="grid grid-cols-2 gap-2">
          <Choice
            label="Formato"
            value={video.format}
            onChange={(format) => setVideo((o) => ({ ...o, format }))}
            options={[
              { value: "mp4", label: "MP4" },
              { value: "webm", label: "WebM" },
            ]}
          />
          <Choice
            label="Quadros por segundo"
            value={video.fps}
            onChange={(fps) => setVideo((o) => ({ ...o, fps }))}
            options={[
              { value: 30, label: "30" },
              { value: 60, label: "60" },
            ]}
          />
        </div>
        <Choice
          label="Duração máxima"
          value={video.maxMs ?? 0}
          onChange={(maxMs) => setVideo((o) => ({ ...o, maxMs: maxMs || null }))}
          options={[
            { value: 30_000, label: "30 s" },
            { value: 60_000, label: "1 min" },
            { value: 120_000, label: "2 min" },
            { value: 0, label: "Sem limite" },
          ]}
        />
        <p className="text-2xs text-muted-foreground">O GIF é gerado depois, na página do vídeo.</p>
      </Section>

      <Collapsible title="Antes de gravar">
        <Check checked={video.countdown} onChange={(countdown) => setVideo((o) => ({ ...o, countdown }))}>
          Contagem regressiva de 3 s
        </Check>
        <Check checked={video.toTop} onChange={(toTop) => setVideo((o) => ({ ...o, toTop }))}>
          Começar do topo da página
        </Check>
        <Check
          checked={video.lazy}
          onChange={(lazy) => setVideo((o) => ({ ...o, lazy }))}
          hint="Rola até o fim e volta antes de gravar, para as imagens já estarem carregadas."
        >
          Carregar imagens lazy
        </Check>
        <Check checked={video.hideScrollbars} onChange={(hideScrollbars) => setVideo((o) => ({ ...o, hideScrollbars }))}>
          Esconder barras de rolagem
        </Check>
      </Collapsible>

      <p className="text-2xs text-muted-foreground">
        Durante a gravação, use a página normalmente: clique, role, preencha e navegue. A aba fica no tamanho escolhido e
        o Chrome mostra a faixa de depuração (ela não aparece no vídeo).
      </p>
    </>
  );
}

function RecordingPanel({ inspector }: { inspector: Inspector }) {
  const { capture } = inspector;
  const state = capture.recording;
  const live = state.status === "recording" || state.status === "paused" || state.status === "countdown";
  const now = useNow(live);
  const [scrollPaused, setScrollPaused] = useState(false);
  const [speed, setSpeed] = useState<number | null>(null);
  const [video] = usePersisted("omnia-inspect:video-options", VIDEO_DEFAULTS);
  const currentSpeed = speed ?? video.autoscroll.speed;
  const elapsed = elapsedOf(state, now);

  return (
    <main className="flex flex-1 flex-col gap-5 overflow-y-auto p-3">
      <div className="flex flex-col items-center gap-3 rounded-md border border-border bg-card px-4 py-6 text-center">
        {state.status === "preparing" && (
          <>
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
            <p className="text-sm font-medium">Preparando a página…</p>
          </>
        )}
        {state.status === "countdown" && (
          <>
            <span className="font-mono text-5xl font-semibold tabular-nums">
              {Math.max(1, Math.ceil(((state.countdownEndsAt ?? now) - now) / 1000))}
            </span>
            <p className="text-xs text-muted-foreground">A gravação começa em instantes</p>
          </>
        )}
        {(state.status === "recording" || state.status === "paused") && (
          <>
            <span
              className={cx(
                "flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold",
                state.status === "recording" ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground",
              )}
            >
              <span className={cx("size-2 rounded-full bg-current", state.status === "recording" && "animate-pulse")} />
              {state.status === "recording" ? "GRAVANDO" : "PAUSADO"}
            </span>
            <span className="font-mono text-4xl font-semibold tabular-nums">
              {fmtTime(elapsed)}
              {state.maxMs ? <span className="text-lg text-muted-foreground"> / {fmtTime(state.maxMs)}</span> : null}
            </span>
          </>
        )}
        {state.status === "saving" && (
          <>
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
            <p className="text-sm font-medium">Salvando o vídeo…</p>
          </>
        )}
        {state.size && (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <DeviceIcon width={state.size.width} className="size-3.5" />
            {state.size.label} · <span className="font-mono">{dims(state.size)}</span>
          </span>
        )}
      </div>

      {state.status !== "saving" && (
        <div className="flex gap-2">
          {(state.status === "recording" || state.status === "paused") && (
            <Button
              variant="outline"
              className="h-9 flex-1"
              onClick={state.status === "paused" ? capture.resumeRecording : capture.pauseRecording}
            >
              {state.status === "paused" ? <Play /> : <Pause />}
              {state.status === "paused" ? "Retomar" : "Pausar"}
            </Button>
          )}
          <Button className="h-9 flex-1" onClick={capture.stopRecording}>
            <Square className="fill-current" /> {state.status === "recording" || state.status === "paused" ? "Parar e salvar" : "Cancelar"}
          </Button>
        </div>
      )}

      {state.autoscroll && (state.status === "recording" || state.status === "paused") && (
        <Section title="Auto scroll">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => {
                capture.autoscroll({ paused: !scrollPaused });
                setScrollPaused((v) => !v);
              }}
            >
              {scrollPaused ? <Play /> : <Pause />} {scrollPaused ? "Retomar rolagem" : "Pausar rolagem"}
            </Button>
            <span className="ml-auto font-mono text-2xs">{currentSpeed} px/s</span>
          </div>
          <input
            type="range"
            min={40}
            max={1200}
            step={10}
            value={currentSpeed}
            onChange={(e) => {
              const value = Number(e.target.value);
              setSpeed(value);
              capture.autoscroll({ speed: value });
            }}
            className="w-full accent-[var(--info)]"
            aria-label="Velocidade do auto scroll"
          />
        </Section>
      )}

      <p className="text-2xs text-muted-foreground">
        Use a página normalmente: clique, role e navegue. <span className="font-mono">Alt+Shift+R</span> também para a
        gravação. Fechar o painel salva o que já foi gravado.
      </p>
    </main>
  );
}

/** Faixa mostrada nas outras abas do painel enquanto grava. */
export function RecordingIndicator({ inspector, onOpen }: { inspector: Inspector; onOpen: () => void }) {
  const state = inspector.capture.recording;
  const now = useNow(state.status === "recording" || state.status === "paused");
  if (state.status === "idle") return null;
  return (
    <div className="flex items-center gap-2 border-b border-destructive/20 bg-destructive/10 px-3 py-1.5 text-xs text-destructive">
      <span className={cx("size-2 shrink-0 rounded-full bg-current", state.status === "recording" && "animate-pulse")} />
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 truncate text-left font-medium hover:underline">
        {state.status === "recording" || state.status === "paused"
          ? `${state.status === "paused" ? "Pausado" : "Gravando"} · ${fmtTime(elapsedOf(state, now))}`
          : state.status === "saving"
            ? "Salvando o vídeo…"
            : "Preparando a gravação…"}
      </button>
      {(state.status === "recording" || state.status === "paused") && (
        <button type="button" onClick={inspector.capture.stopRecording} className="font-semibold hover:underline">
          Parar
        </button>
      )}
    </div>
  );
}
