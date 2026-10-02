import { Ban, Camera, ChevronDown, Crosshair, Image as ImageIcon, Keyboard, MonitorSmartphone, Moon, MousePointerClick, RefreshCw, Sun, X } from "lucide-react";
import { Fragment, useEffect, useState } from "react";
import { A11yPanel } from "./components/A11yPanel";
import { CaptureView, RecordingIndicator } from "./components/CaptureView";
import { AssetsView } from "./components/AssetsView";
import { CodePanel } from "./components/CodePanel";
import { ComponentHeader } from "./components/ComponentHeader";
import { FindingsPanel } from "./components/FindingsPanel";
import { TokensPanel } from "./components/TokensPanel";
import { TreePanel } from "./components/TreePanel";
import { ComparisonView } from "./components/ComparisonView";
import { ResponsiveView, ViewportIndicator } from "./components/ResponsiveView";
import { SelectionBar } from "./components/SelectionBar";
import { Badge, Button, IconButton, Tabs, cx } from "./components/ui";
import { useInspector, type Inspector } from "./useInspector";

type Tab = "tokens" | "alertas" | "a11y" | "codigo" | "estrutura";
type View = "inspect" | "responsive" | "capture" | "assets";

function Logo() {
  return (
    <div className="flex items-center gap-2">
      <span className="flex size-6 items-center justify-center rounded-xs bg-primary text-primary-foreground">
        <Crosshair className="size-3.5" />
      </span>
      <span className="text-sm font-semibold">Omnia Inspect</span>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded-[4px] border border-border bg-muted px-1 py-px font-mono text-2xs text-foreground-alt">
      {children}
    </kbd>
  );
}

function EmptyState({ inspector }: { inspector: Inspector }) {
  if (inspector.status === "unsupported") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
        <Ban className="size-8 text-muted-foreground" />
        <p className="text-sm font-medium">Esta página não pode ser inspecionada</p>
        <p className="text-xs text-muted-foreground">
          O Chrome bloqueia extensões em páginas internas (chrome://, Chrome Web Store) e em arquivos locais sem
          permissão. Abra um site ou app em desenvolvimento.
        </p>
        <Button variant="outline" onClick={() => inspector.retry()}>
          <RefreshCw /> Tentar de novo
        </Button>
      </div>
    );
  }
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
      <span className="flex size-12 items-center justify-center rounded-md bg-info-subtle text-info-subtle-foreground">
        <MousePointerClick className="size-6" />
      </span>
      <div className="flex flex-col gap-1">
        <p className="text-base font-semibold">
          {inspector.inspecting ? "Passe o mouse e clique em um elemento" : "Selecione um elemento"}
        </p>
        <p className="text-xs text-muted-foreground">
          Veja qual componente do Omnia DS ou shadcn ele é, suas variantes, os tokens aplicados e o que está fora do
          padrão.
        </p>
      </div>
      {!inspector.inspecting && (
        <Button variant="info" onClick={inspector.toggleInspect} disabled={inspector.status !== "ready"}>
          <Crosshair /> Inspecionar
        </Button>
      )}
      <ShortcutList className="w-full max-w-72 text-left" />
    </div>
  );
}

const isMac = typeof navigator !== "undefined" && /Mac/.test(navigator.platform);
const MOD = isMac ? "⌘" : "Ctrl";
const ALT = isMac ? "Option" : "Alt";

const SHORTCUTS: Array<[React.ReactNode, string]> = [
  [<Kbd key="c">Clique</Kbd>, "seleciona o componente"],
  [<><Kbd>{MOD}</Kbd> + <Kbd>Clique</Kbd></>, "seleciona a camada exata"],
  [<Kbd key="d">Duplo clique</Kbd>, "entra um nível"],
  [<><Kbd>Shift</Kbd> + <Kbd>Clique</Kbd></>, "adiciona/remove da seleção"],
  [<><Kbd>{ALT}</Kbd> + passar o mouse</>, "mede a distância"],
  [<><Kbd>↑</Kbd> <Kbd>↓</Kbd> <Kbd>←</Kbd> <Kbd>→</Kbd></>, "pai · filho · irmãos"],
  [<Kbd key="e">Esc</Kbd>, "sai da inspeção (2× limpa)"],
  [<><Kbd>Alt</Kbd> + <Kbd>Shift</Kbd> + <Kbd>C</Kbd></>, "liga/desliga a inspeção"],
];

function ShortcutList({ className }: { className?: string }) {
  return (
    <dl className={cx("grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1.5 text-2xs text-muted-foreground", className)}>
      {SHORTCUTS.map(([keys, text], i) => (
        <Fragment key={i}>
          <dt className="whitespace-nowrap text-foreground-alt">{keys}</dt>
          <dd>{text}</dd>
        </Fragment>
      ))}
    </dl>
  );
}

/** Rodapé recolhível com os atalhos (estado lembrado). */
function ShortcutsFooter() {
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem("omnia-inspect:shortcuts") !== "closed";
    } catch {
      return true;
    }
  });
  const toggle = () => {
    setOpen((v) => {
      try {
        localStorage.setItem("omnia-inspect:shortcuts", v ? "closed" : "open");
      } catch {
        /* sem storage */
      }
      return !v;
    });
  };
  return (
    <footer className="border-t border-border bg-background px-3 py-1.5">
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-center justify-between text-2xs font-medium text-muted-foreground hover:text-foreground"
      >
        <span className="flex items-center gap-1.5">
          <Keyboard className="size-3.5" /> Atalhos
          {!open && (
            <span className="font-normal">
              · Shift adiciona · {MOD} camada exata · {ALT} mede
            </span>
          )}
        </span>
        <ChevronDown className={cx("size-3.5 transition-transform", open && "rotate-180")} />
      </button>
      {open && <ShortcutList className="pt-2 pb-1" />}
    </footer>
  );
}

export function App() {
  return <InspectorView inspector={useInspector()} />;
}

function ViewNav({ view, onChange }: { view: View; onChange: (v: View) => void }) {
  const items: Array<{ value: View; label: string; icon: typeof Crosshair }> = [
    { value: "inspect", label: "Inspecionar", icon: Crosshair },
    { value: "responsive", label: "Responsivo", icon: MonitorSmartphone },
    { value: "capture", label: "Capturar", icon: Camera },
    { value: "assets", label: "Imagens", icon: ImageIcon },
  ];
  return (
    <nav className="flex border-b border-border px-1.5">
      {items.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          onClick={() => onChange(value)}
          className={cx(
            "flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap border-b-2 px-1 py-2 text-xs font-medium transition-colors",
            view === value
              ? "border-foreground text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          <Icon className="size-3.5" />
          {label}
        </button>
      ))}
    </nav>
  );
}

export function InspectorView({ inspector }: { inspector: Inspector }) {
  const [tab, setTab] = useState<Tab>("tokens");
  const [view, setView] = useState<View>("inspect");
  const [comparing, setComparing] = useState(false);
  // Botão "Capturar" do palco ou atalho de gravação: vai para a aba Capturar
  const captureRequest = inspector.capture.request;
  useEffect(() => {
    if (captureRequest) setView("capture");
  }, [captureRequest]);
  // Volta aos detalhes quando a seleção deixa de ser múltipla
  if (comparing && inspector.results.length < 2) setComparing(false);
  const { result } = inspector;
  const host = (() => {
    try {
      return inspector.url ? new URL(inspector.url).host : "";
    } catch {
      return "";
    }
  })();

  const errors = result?.findings.filter((f) => f.severity === "error").length ?? 0;
  const warnings = result?.findings.filter((f) => f.severity !== "info").length ?? 0;

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <Logo />
        <div className="flex items-center gap-1">
          {result && view === "inspect" && (
            <>
              <IconButton title="Reanalisar elemento" onClick={inspector.refresh}>
                <RefreshCw />
              </IconButton>
              <IconButton title="Limpar seleção" onClick={inspector.clear}>
                <X />
              </IconButton>
            </>
          )}
          <Button
            variant={inspector.inspecting ? "info" : "outline"}
            onClick={() => {
              setView("inspect");
              inspector.toggleInspect();
            }}
            disabled={inspector.status !== "ready"}
            title="Alt+Shift+C"
          >
            <Crosshair />
            {inspector.inspecting ? "Inspecionando…" : "Inspecionar"}
          </Button>
        </div>
      </header>

      <ViewNav view={view} onChange={setView} />
      {view !== "capture" && <RecordingIndicator inspector={inspector} onOpen={() => setView("capture")} />}
      <ViewportIndicator inspector={inspector} onOpen={() => setView("responsive")} />

      {view === "responsive" && <ResponsiveView inspector={inspector} onOpenCapture={() => setView("capture")} />}
      {view === "capture" && <CaptureView inspector={inspector} />}
      {view === "assets" && <AssetsView inspector={inspector} />}

      {view === "inspect" && host && (
        <div className="flex items-center gap-1.5 border-b border-border px-3 py-1.5 text-2xs text-muted-foreground">
          <span className="truncate">{host}</span>
          {result && (
            <>
              <Badge tone="outline" className="ml-auto" >
                {result.page.viewportWidth ?? "?"}px · {result.page.breakpoint}
              </Badge>
              <Badge tone="outline">
                {result.page.theme === "dark" ? <Moon className="size-3" /> : <Sun className="size-3" />}
                {result.page.theme === "dark" ? "dark" : "light"}
              </Badge>
              {result.page.usesOmniaTokens ? (
                <Badge tone="brand">tokens Omnia</Badge>
              ) : (
                <Badge>sem tokens Omnia</Badge>
              )}
            </>
          )}
        </div>
      )}

      {view === "inspect" &&
        (!result ? (
          <EmptyState inspector={inspector} />
        ) : (
          <main className="flex flex-1 flex-col gap-3 overflow-y-auto p-3">
            {inspector.stale && (
              <p className="rounded-sm bg-warning-subtle px-2 py-1.5 text-xs text-warning-subtle-foreground">
                O elemento saiu da página (re-render?). Selecione novamente para atualizar.
              </p>
            )}
            {inspector.results.length > 1 && (
              <SelectionBar inspector={inspector} comparing={comparing} onToggleCompare={() => setComparing((v) => !v)} />
            )}
            {comparing && inspector.results.length > 1 ? (
              <ComparisonView results={inspector.results} inspector={inspector} />
            ) : (
            <>
            <ComponentHeader result={result} inspector={inspector} />
            <div className="sticky top-0 z-10 -mx-3 bg-background px-3 py-1">
              <Tabs<Tab>
                value={tab}
                onChange={setTab}
                items={[
                  { value: "tokens", label: "Tokens" },
                  {
                    value: "alertas",
                    label: "Alertas",
                    count: result.findings.length,
                    tone: errors ? "destructive" : warnings ? "warning" : "info",
                  },
                  { value: "a11y", label: "Acessibilidade" },
                  { value: "codigo", label: "Código" },
                  { value: "estrutura", label: "Árvore" },
                ]}
              />
            </div>
            <div className="pb-4">
              {tab === "tokens" && <TokensPanel result={result} />}
              {tab === "alertas" && <FindingsPanel result={result} />}
              {tab === "a11y" && <A11yPanel result={result} />}
              {tab === "codigo" && <CodePanel result={result} />}
              {tab === "estrutura" && <TreePanel result={result} inspector={inspector} />}
            </div>
            </>
            )}
          </main>
        ))}
      {view === "inspect" && inspector.status === "ready" && <ShortcutsFooter />}
    </div>
  );
}
