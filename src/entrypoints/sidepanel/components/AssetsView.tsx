import { Check, Copy, Crosshair, Download, Loader2, Pencil, RefreshCw, Search, Shapes, Image as ImageIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { PageAsset } from "../../../shared/assets";
import type { AssetsResponse } from "../../../shared/messages";
import { createZip } from "../../../shared/zip";
import {
  assetFile,
  fileName,
  formatBytes,
  probeMeta,
  svgMarkup,
  thumbnailSrc,
  type AssetMeta,
  type SvgExport,
} from "../lib/export";
import type { Inspector } from "../useInspector";
import { Badge, Button, IconButton, cx, useCopy } from "./ui";

type Kind = "svg" | "image";

const SOURCE_LABEL: Record<PageAsset["source"], string> = {
  "svg-inline": "SVG inline",
  img: "<img>",
  picture: "<picture>",
  css: "background CSS",
  favicon: "favicon",
  "video-poster": "poster de vídeo",
};

function hostOf(url: string) {
  try {
    return new URL(url).host.replace(/[^a-z0-9.-]/gi, "-") || "pagina";
  } catch {
    return "pagina";
  }
}

async function pool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  const queue = [...items];
  await Promise.all(
    Array.from({ length: Math.min(limit, queue.length) }, async () => {
      while (queue.length) await fn(queue.shift()!);
    }),
  );
}

function Thumb({ asset }: { asset: PageAsset }) {
  const [failed, setFailed] = useState(false);
  const src = thumbnailSrc(asset);
  return (
    <span
      className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-sm border border-border"
      style={{ background: "repeating-conic-gradient(var(--muted) 0% 25%, var(--background) 0% 50%) 50% / 10px 10px" }}
    >
      {src && !failed ? (
        <img src={src} alt="" className="max-h-9 max-w-9 object-contain" onError={() => setFailed(true)} loading="lazy" />
      ) : asset.kind === "svg" ? (
        <Shapes className="size-4 text-muted-foreground" />
      ) : (
        <ImageIcon className="size-4 text-muted-foreground" />
      )}
    </span>
  );
}

function AssetRow({
  asset,
  name,
  meta,
  selected,
  onToggle,
  onRename,
  onDownload,
  onCopy,
  onReveal,
  downloading,
}: {
  asset: PageAsset;
  name: string;
  meta?: AssetMeta;
  selected: boolean;
  onToggle: () => void;
  onRename: (name: string) => void;
  onDownload: () => void;
  onCopy: () => Promise<void>;
  onReveal: () => void;
  downloading: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState(false);
  const format = (meta?.format ?? asset.format).toUpperCase();
  const size = asset.width && asset.height ? `${asset.width}×${asset.height}` : asset.renderedWidth ? `${asset.renderedWidth}×${asset.renderedHeight}` : undefined;
  return (
    <div
      className={cx(
        "group flex items-center gap-2 rounded-sm px-1.5 py-1.5 transition-colors",
        selected ? "bg-info-subtle/60" : "hover:bg-accent",
      )}
    >
      <input type="checkbox" checked={selected} onChange={onToggle} aria-label={`Selecionar ${name}`} />
      <Thumb asset={asset} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        {editing ? (
          <input
            autoFocus
            defaultValue={name}
            onBlur={(e) => {
              onRename(e.target.value);
              setEditing(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") setEditing(false);
            }}
            className="h-6 w-full rounded-xs border border-input bg-input-background px-1.5 font-mono text-xs"
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            title="Renomear"
            className="flex min-w-0 items-center gap-1 text-left text-xs font-medium"
          >
            <span className="truncate">{name}</span>
            <Pencil className="size-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-50" />
          </button>
        )}
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-2xs text-muted-foreground">
          <Badge tone={asset.kind === "svg" ? "info" : "success"} className="px-1 py-0 text-[10px]">
            {format === "?" ? "IMG" : format}
          </Badge>
          {size && <span className="font-mono">{size}</span>}
          {formatBytes(meta?.bytes) && <span>{formatBytes(meta?.bytes)}</span>}
          {asset.count > 1 && <span>usado {asset.count}×</span>}
          <span className="truncate" title={asset.url}>
            {SOURCE_LABEL[asset.source]}
          </span>
        </div>
      </div>
      <div className="flex shrink-0 items-center opacity-60 transition-opacity group-hover:opacity-100">
        <IconButton title="Mostrar na página" onClick={onReveal} disabled={!asset.elementIds.length}>
          <Crosshair />
        </IconButton>
        <IconButton
          title={asset.kind === "svg" ? "Copiar código SVG" : "Copiar URL"}
          onClick={async () => {
            await onCopy();
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          }}
        >
          {copied ? <Check className="text-success" /> : <Copy />}
        </IconButton>
        <IconButton title="Baixar" onClick={onDownload} disabled={downloading}>
          {downloading ? <Loader2 className="animate-spin" /> : <Download />}
        </IconButton>
      </div>
    </div>
  );
}

export function AssetsView({ inspector }: { inspector: Inspector }) {
  const [assets, setAssets] = useState<PageAsset[] | null>(null);
  const [pageInfo, setPageInfo] = useState({ url: "", title: "" });
  const [loading, setLoading] = useState(false);
  const [kind, setKind] = useState<Kind>("svg");
  const [query, setQuery] = useState("");
  const [formatFilter, setFormatFilter] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [names, setNames] = useState<Record<string, string>>({});
  const [meta, setMeta] = useState<Record<string, AssetMeta>>({});
  const [svgAs, setSvgAs] = useState<SvgExport>("svg");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  const { copy } = useCopy();

  const load = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    const res = await inspector.request<AssetsResponse>({ type: "collect-assets" });
    setLoading(false);
    if (!res?.ok) {
      setAssets(null);
      setError("Não foi possível ler as imagens desta página.");
      return;
    }
    setAssets(res.assets);
    setPageInfo({ url: res.url, title: res.title });
    setSelected(new Set());
    setNames({});
    setMeta({});
    if (!res.assets.some((a) => a.kind === "svg") && res.assets.some((a) => a.kind === "image")) setKind("image");
    // tamanho/tipo real das imagens (em segundo plano)
    const withUrl = res.assets.filter((a) => a.url && /^https?:/.test(a.url));
    void pool(withUrl, 6, async (asset) => {
      const info = await probeMeta(asset.url!);
      setMeta((m) => ({ ...m, [asset.key]: info }));
    });
  }, [inspector.request]);

  useEffect(() => {
    if (inspector.status === "ready") void load();
  }, [inspector.status, inspector.pageKey, load]);

  const nameOf = (a: PageAsset) => names[a.key] ?? a.name;
  const formatOf = (a: PageAsset) => meta[a.key]?.format ?? a.format;

  const byKind = useMemo(() => {
    const list = assets ?? [];
    return { svg: list.filter((a) => a.kind === "svg"), image: list.filter((a) => a.kind === "image") };
  }, [assets]);

  const formats = useMemo(
    () => [...new Set(byKind.image.map((a) => formatOf(a)))].sort(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [byKind.image, meta],
  );

  const visible = byKind[kind].filter(
    (a) =>
      (!query || nameOf(a).includes(query.toLowerCase()) || a.url?.toLowerCase().includes(query.toLowerCase())) &&
      (kind === "svg" || !formatFilter || formatOf(a) === formatFilter),
  );
  const visibleSelected = visible.filter((a) => selected.has(a.key));
  const allSelected = visible.length > 0 && visibleSelected.length === visible.length;
  const host = hostOf(pageInfo.url || inspector.url || "");

  const folderOf = (a: PageAsset) => (a.kind === "svg" ? (svgAs === "svg" ? "svg" : "icones-png") : "imagens");

  const downloadOne = async (asset: PageAsset) => {
    setBusy(asset.key);
    setError(undefined);
    try {
      const { blob, ext } = await assetFile(asset, svgAs, inspector.request);
      await inspector.download({ blob, filename: `omnia-inspect/${host}/${folderOf(asset)}/${fileName(nameOf(asset), ext)}` });
    } catch (e) {
      setError(`Falha ao baixar ${nameOf(asset)}: ${String((e as Error).message ?? e)}`);
    } finally {
      setBusy(null);
    }
  };

  const downloadZip = async (list: PageAsset[]) => {
    setBusy("zip");
    setError(undefined);
    const entries: Array<{ path: string; data: Uint8Array }> = [];
    const failed: string[] = [];
    await pool(list, 6, async (asset) => {
      try {
        const { blob, ext } = await assetFile(asset, svgAs, inspector.request);
        entries.push({ path: `${folderOf(asset)}/${fileName(nameOf(asset), ext)}`, data: new Uint8Array(await blob.arrayBuffer()) });
      } catch {
        failed.push(nameOf(asset));
      }
    });
    if (entries.length) {
      entries.sort((a, b) => a.path.localeCompare(b.path));
      await inspector.download({ blob: createZip(entries), filename: `omnia-inspect/${host}-imagens.zip` });
    }
    if (failed.length) setError(`Não foi possível baixar: ${failed.slice(0, 5).join(", ")}${failed.length > 5 ? "…" : ""}`);
    setBusy(null);
  };

  const toggle = (key: string) =>
    setSelected((set) => {
      const next = new Set(set);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  if (inspector.status === "unsupported") {
    return (
      <div className="flex flex-1 items-center justify-center px-6 text-center text-xs text-muted-foreground">
        O Chrome não permite ler esta página.
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Cabeçalho: tipo + busca */}
      <div className="flex flex-col gap-2 border-b border-border p-3">
        <div className="flex items-center gap-2">
          <div role="tablist" className="flex flex-1 gap-0.5 rounded-sm bg-muted p-0.5">
            {(
              [
                { value: "svg", label: "Ícones · SVG", icon: Shapes },
                { value: "image", label: "Imagens", icon: ImageIcon },
              ] as const
            ).map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                role="tab"
                type="button"
                aria-selected={kind === value}
                onClick={() => {
                  setKind(value);
                  setFormatFilter(null);
                }}
                className={cx(
                  "flex h-7 flex-1 items-center justify-center gap-1.5 rounded-xs text-xs font-medium",
                  kind === value ? "bg-background shadow-xs" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-3.5" />
                {label}
                <span className="text-2xs text-muted-foreground">{byKind[value].length}</span>
              </button>
            ))}
          </div>
          <IconButton title="Ler a página de novo" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={cx(loading && "animate-spin")} />
          </IconButton>
        </div>
        <div className="flex items-center gap-1.5 rounded-sm border border-input bg-input-background px-2">
          <Search className="size-3.5 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nome ou URL"
            className="h-8 flex-1 bg-transparent text-xs outline-none"
          />
        </div>
        {kind === "image" && formats.length > 1 && (
          <div className="flex flex-wrap gap-1">
            {[null, ...formats].map((f) => (
              <button
                key={f ?? "all"}
                type="button"
                onClick={() => setFormatFilter(f)}
                className={cx(
                  "rounded-full border px-2 py-0.5 text-2xs font-medium uppercase",
                  formatFilter === f ? "border-foreground bg-foreground text-background" : "border-border hover:bg-accent",
                )}
              >
                {f === null ? "todos" : f === "?" ? "outros" : f}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Lista */}
      <div className="flex-1 overflow-y-auto p-1.5">
        {loading && !assets && (
          <div className="flex items-center justify-center gap-2 py-10 text-xs text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Lendo a página…
          </div>
        )}
        {assets && visible.length === 0 && (
          <p className="py-10 text-center text-xs text-muted-foreground">
            {byKind[kind].length ? "Nada encontrado com esse filtro." : kind === "svg" ? "Nenhum SVG visível nesta página." : "Nenhuma imagem visível nesta página."}
          </p>
        )}
        {visible.map((asset) => (
          <AssetRow
            key={asset.key}
            asset={asset}
            name={nameOf(asset)}
            meta={meta[asset.key]}
            selected={selected.has(asset.key)}
            downloading={busy === asset.key}
            onToggle={() => toggle(asset.key)}
            onRename={(value) => {
              const clean = value.trim().toLowerCase().replace(/[^a-z0-9-_]+/g, "-").replace(/^-+|-+$/g, "");
              if (clean) setNames((n) => ({ ...n, [asset.key]: clean }));
            }}
            onDownload={() => void downloadOne(asset)}
            onCopy={async () => {
              if (asset.kind === "svg") await copy(await svgMarkup(asset, inspector.request));
              else if (asset.url) await copy(asset.url);
            }}
            onReveal={() => void inspector.request({ type: "reveal", id: asset.elementIds[0] })}
          />
        ))}
      </div>

      {/* Rodapé de exportação */}
      {assets && byKind[kind].length > 0 && (
        <footer className="flex flex-col gap-2 border-t border-border p-3">
          {error && <p className="text-2xs text-destructive">{error}</p>}
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={() =>
                  setSelected((set) => {
                    const next = new Set(set);
                    for (const a of visible) {
                      if (allSelected) next.delete(a.key);
                      else next.add(a.key);
                    }
                    return next;
                  })
                }
              />
              Selecionar todos
            </label>
            {kind === "svg" && (
              <select
                value={svgAs}
                onChange={(e) => setSvgAs(e.target.value as SvgExport)}
                className="ml-auto h-7 rounded-xs border border-input bg-input-background px-1.5 text-xs"
                title="Formato de exportação dos ícones"
              >
                <option value="svg">SVG</option>
                <option value="png@1x">PNG 1x</option>
                <option value="png@2x">PNG 2x</option>
                <option value="png@3x">PNG 3x</option>
              </select>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              variant="info"
              className="flex-1"
              disabled={busy !== null || visibleSelected.length === 0}
              onClick={() =>
                visibleSelected.length === 1 ? void downloadOne(visibleSelected[0]) : void downloadZip(visibleSelected)
              }
            >
              {busy === "zip" ? <Loader2 className="animate-spin" /> : <Download />}
              {visibleSelected.length > 1
                ? `Baixar ${visibleSelected.length} (.zip)`
                : visibleSelected.length === 1
                  ? "Baixar selecionado"
                  : "Selecione para baixar"}
            </Button>
            <Button
              variant="outline"
              disabled={busy !== null || !assets.length}
              onClick={() => void downloadZip(assets)}
              title="SVGs e imagens em pastas separadas"
            >
              Tudo (.zip)
            </Button>
          </div>
          <p className="text-2xs text-muted-foreground">
            Salvo em Downloads/omnia-inspect/{host}. Clique no nome para renomear antes de baixar.
          </p>
        </footer>
      )}
    </div>
  );
}
