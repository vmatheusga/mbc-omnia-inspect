import { formatFromUrl, nameFromUrl, slugify, type PageAsset } from "../../shared/assets";
import { idOf } from "./collect";

const SVG_NS = "http://www.w3.org/2000/svg";

function isVisible(el: Element): boolean {
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return false;
  const style = getComputedStyle(el);
  return style.display !== "none" && style.visibility !== "hidden";
}

/** Nome legível para um SVG: aria-label, <title>, lucide-*, id, rótulo do botão pai… */
function svgName(svg: SVGSVGElement): string | undefined {
  const cls = svg.getAttribute("class") ?? "";
  const lucide = cls.match(/lucide-([a-z0-9-]+)/)?.[1];
  const candidates = [
    svg.getAttribute("aria-label"),
    svg.querySelector(":scope > title")?.textContent,
    lucide,
    cls.match(/(?:^|\s)(?:icon|i)-([a-z0-9-]+)/)?.[1],
    svg.getAttribute("data-icon"),
    svg.getAttribute("data-testid"),
    svg.id,
    svg.querySelector("use")?.getAttribute("href")?.replace(/^.*#/, ""),
    svg.closest("[aria-label]")?.getAttribute("aria-label"),
  ];
  const found = candidates.find((c) => c && slugify(c));
  return found ? slugify(found) : undefined;
}

function imageName(el: Element, url: string): string | undefined {
  const candidates = [
    el.getAttribute("alt"),
    el.getAttribute("title"),
    el.getAttribute("aria-label"),
    nameFromUrl(url),
  ];
  const found = candidates.find((c) => c && slugify(c));
  return found ? slugify(found) : undefined;
}

/** Serializa um SVG inline em arquivo autônomo (xmlns, dimensões, <use> resolvidos). */
function serializeSvg(svg: SVGSVGElement): { markup: string; width: number; height: number } {
  const rect = svg.getBoundingClientRect();
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", SVG_NS);
  const viewBox = svg.viewBox?.baseVal;
  const width = Math.round(parseFloat(svg.getAttribute("width") ?? "") || viewBox?.width || rect.width);
  const height = Math.round(parseFloat(svg.getAttribute("height") ?? "") || viewBox?.height || rect.height);
  if (!clone.getAttribute("width")) clone.setAttribute("width", String(Math.round(rect.width) || width));
  if (!clone.getAttribute("height")) clone.setAttribute("height", String(Math.round(rect.height) || height));
  clone.removeAttribute("class");
  clone.removeAttribute("style");
  for (const attr of ["data-omnia-inspect-probe", "aria-hidden", "focusable"]) clone.removeAttribute(attr);

  // <use href="#sprite"> aponta para fora do SVG: traz as definições junto.
  const refs = new Set<string>();
  clone.querySelectorAll("use").forEach((use) => {
    const href = use.getAttribute("href") ?? use.getAttribute("xlink:href");
    if (href?.startsWith("#")) refs.add(href.slice(1));
  });
  if (refs.size) {
    const defs = document.createElementNS(SVG_NS, "defs");
    for (const id of refs) {
      if (clone.querySelector(`#${CSS.escape(id)}`)) continue;
      const target = document.getElementById(id);
      if (target) defs.append(target.cloneNode(true));
    }
    if (defs.childNodes.length) clone.prepend(defs);
  }
  return { markup: new XMLSerializer().serializeToString(clone), width, height };
}

const CSS_URL = /url\((['"]?)(.*?)\1\)/g;

export function collectAssets(ignore?: (el: Element) => boolean): PageAsset[] {
  const assets = new Map<string, PageAsset>();

  const add = (asset: Omit<PageAsset, "count" | "elementIds">, el: Element) => {
    if (ignore?.(el)) return;
    const existing = assets.get(asset.key);
    if (existing) {
      existing.count++;
      if (existing.elementIds.length < 50) existing.elementIds.push(idOf(el));
      if (!existing.alt && asset.alt) existing.alt = asset.alt;
      return;
    }
    assets.set(asset.key, { ...asset, count: 1, elementIds: [idOf(el)] });
  };

  // SVG inline (ignora SVGs aninhados e os da própria extensão)
  document.querySelectorAll("svg").forEach((svg) => {
    if (svg.parentElement?.closest("svg") || svg.closest("omnia-inspect-overlay")) return;
    if (!isVisible(svg)) return;
    const { markup, width, height } = serializeSvg(svg as SVGSVGElement);
    const rect = svg.getBoundingClientRect();
    // chave sem dimensões/cor para agrupar o mesmo ícone em tamanhos diferentes
    const key = `svg:${markup.replace(/\s(width|height)="[^"]*"/g, "")}`;
    add(
      {
        key,
        kind: "svg",
        format: "svg",
        name: svgName(svg as SVGSVGElement) ?? "",
        source: "svg-inline",
        svg: markup,
        width,
        height,
        renderedWidth: Math.round(rect.width),
        renderedHeight: Math.round(rect.height),
      },
      svg,
    );
  });

  // <img> (currentSrc já considera srcset/<picture>)
  document.querySelectorAll("img").forEach((img) => {
    const url = img.currentSrc || img.src;
    if (!url || !isVisible(img)) return;
    const format = formatFromUrl(url);
    const rect = img.getBoundingClientRect();
    add(
      {
        key: `url:${url}`,
        kind: format === "svg" ? "svg" : "image",
        format,
        name: imageName(img, url) ?? "",
        source: img.closest("picture") ? "picture" : "img",
        url,
        width: img.naturalWidth,
        height: img.naturalHeight,
        renderedWidth: Math.round(rect.width),
        renderedHeight: Math.round(rect.height),
        alt: img.alt || undefined,
      },
      img,
    );
  });

  // <video poster>
  document.querySelectorAll("video[poster]").forEach((video) => {
    const url = (video as HTMLVideoElement).poster;
    if (!url) return;
    const rect = video.getBoundingClientRect();
    add(
      {
        key: `url:${url}`,
        kind: "image",
        format: formatFromUrl(url),
        name: nameFromUrl(url) ?? "poster",
        source: "video-poster",
        url,
        width: 0,
        height: 0,
        renderedWidth: Math.round(rect.width),
        renderedHeight: Math.round(rect.height),
      },
      video,
    );
  });

  // background-image em CSS
  document.querySelectorAll("body *").forEach((el) => {
    if (el.closest("omnia-inspect-overlay")) return;
    const bg = getComputedStyle(el).backgroundImage;
    if (!bg || bg === "none" || !bg.includes("url(")) return;
    if (!isVisible(el)) return;
    const rect = el.getBoundingClientRect();
    for (const match of bg.matchAll(CSS_URL)) {
      const url = match[2];
      if (!url) continue;
      const format = formatFromUrl(url);
      add(
        {
          key: `url:${url}`,
          kind: format === "svg" ? "svg" : "image",
          format,
          name: imageName(el, url) ?? "",
          source: "css",
          url,
          width: 0,
          height: 0,
          renderedWidth: Math.round(rect.width),
          renderedHeight: Math.round(rect.height),
        },
        el,
      );
    }
  });

  // favicons
  document.querySelectorAll('link[rel~="icon"], link[rel="apple-touch-icon"]').forEach((link) => {
    const url = (link as HTMLLinkElement).href;
    if (!url) return;
    const format = formatFromUrl(url);
    const size = link.getAttribute("sizes")?.match(/(\d+)x(\d+)/);
    add(
      {
        key: `url:${url}`,
        kind: format === "svg" ? "svg" : "image",
        format,
        name: `favicon${size ? `-${size[1]}` : ""}`,
        source: "favicon",
        url,
        width: size ? Number(size[1]) : 0,
        height: size ? Number(size[2]) : 0,
        renderedWidth: 0,
        renderedHeight: 0,
      },
      link,
    );
  });

  // Nomes: fallback numerado e deduplicação (logo, logo-2…)
  const used = new Map<string, number>();
  let svgCount = 0;
  let imgCount = 0;
  const list = [...assets.values()];
  for (const asset of list) {
    const base = asset.name || (asset.kind === "svg" ? `icone-${++svgCount}` : `imagem-${++imgCount}`);
    const n = (used.get(base) ?? 0) + 1;
    used.set(base, n);
    asset.name = n === 1 ? base : `${base}-${n}`;
  }
  return list;
}

/** Busca um asset a partir da página (blob:, ou quando o painel não consegue). */
export async function fetchAsDataUrl(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const blob = await res.blob();
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
