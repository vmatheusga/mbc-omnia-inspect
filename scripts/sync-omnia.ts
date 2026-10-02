/**
 * Gera a base de conhecimento da extensão a partir do código-fonte do Omnia DS
 * (e de instalações shadcn de referência).
 *
 *   pnpm sync:omnia
 *
 * Variáveis de ambiente:
 *   OMNIA_DS_PATH       caminho do monorepo omnia-ds (padrão: ../omnia-ds)
 *   SHADCN_BASELINES    lista "id=label=caminho" separada por ";" (opcional)
 */
import fs from "node:fs";
import path from "node:path";
import postcss, { type AtRule, type Rule } from "postcss";
import {
  Node,
  Project,
  SyntaxKind,
  type CallExpression,
  type Expression,
  type ObjectLiteralExpression,
} from "ts-morph";
import type {
  DesignSystemKnowledge,
  Knowledge,
  SlotDef,
  TokenDef,
  VariantConfig,
} from "../src/engine/types";

const root = path.resolve(import.meta.dirname, "..");
const omniaPath = path.resolve(
  root,
  process.env.OMNIA_DS_PATH ?? "../omnia-ds",
);
const prototipagem = path.resolve(root, "../prototipagem");

const defaultBaselines = [
  {
    id: "shadcn-new-york",
    label: "shadcn/ui · new-york",
    dir: path.join(prototipagem, "peregrino/src/components/ui"),
  },
  {
    id: "shadcn-base-nova",
    label: "shadcn/ui · base-nova",
    dir: path.join(prototipagem, "backoffice-proto/src/components/ui"),
  },
  {
    id: "shadcn-default",
    label: "shadcn/ui · default",
    dir: path.join(prototipagem, "auth/components/ui"),
  },
];

const baselines = process.env.SHADCN_BASELINES
  ? process.env.SHADCN_BASELINES.split(";").map((entry) => {
      const [id, label, dir] = entry.split("=");
      return { id, label, dir: path.resolve(root, dir) };
    })
  : defaultBaselines;

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------

function extractTokens(cssFile: string): TokenDef[] {
  const ast = postcss.parse(fs.readFileSync(cssFile, "utf8"));
  const theme = new Map<string, string>();
  const light = new Map<string, string>();
  const dark = new Map<string, string>();

  ast.walkAtRules("theme", (rule: AtRule) => {
    rule.walkDecls((d) => void theme.set(d.prop, d.value));
  });
  ast.walkRules((rule: Rule) => {
    const target =
      rule.selector === ":root" ? light : rule.selector === ".dark" ? dark : null;
    if (!target) return;
    rule.walkDecls((d) => void target.set(d.prop, d.value));
  });

  const resolve = (value: string | undefined, scope: Map<string, string>) => {
    let current = value;
    for (let i = 0; i < 5 && current; i++) {
      const m = current.match(/^var\((--[\w-]+)\)$/);
      if (!m) break;
      current = scope.get(m[1]) ?? light.get(m[1]);
    }
    return current;
  };

  const tokens: TokenDef[] = [];
  for (const [prop, value] of theme) {
    let m: RegExpMatchArray | null;
    if ((m = prop.match(/^--color-(.+)$/))) {
      const cssVar = value.match(/^var\((--[\w-]+)\)$/)?.[1] ?? prop;
      tokens.push({
        name: cssVar,
        kind: "color",
        utility: m[1],
        light: resolve(light.get(cssVar), light),
        dark: resolve(dark.get(cssVar) ?? light.get(cssVar), dark),
      });
    } else if ((m = prop.match(/^--radius-(.+)$/))) {
      tokens.push({ name: prop, kind: "radius", utility: m[1], light: value });
    } else if ((m = prop.match(/^--shadow-(.+)$/))) {
      tokens.push({ name: prop, kind: "shadow", utility: m[1], light: value });
    } else if ((m = prop.match(/^--text-([\w]+)$/))) {
      tokens.push({
        name: prop,
        kind: "text",
        utility: m[1],
        light: value,
        lineHeight: theme.get(`${prop}--line-height`),
      });
    } else if ((m = prop.match(/^--font-weight-(.+)$/))) {
      tokens.push({ name: prop, kind: "weight", utility: m[1], light: value });
    } else if ((m = prop.match(/^--font-(sans|serif|mono)$/))) {
      tokens.push({
        name: prop,
        kind: "font",
        utility: m[1],
        light: resolve(value, light),
      });
    }
  }

  for (const [prop, value] of light) {
    if (/^--(red|grey|gray|teal|amber|blue|green)-\d+$/.test(prop)) {
      tokens.push({ name: prop, kind: "primitive-color", light: value, dark: value });
    }
  }
  return tokens;
}

// ---------------------------------------------------------------------------
// Componentes (data-slot + cva)
// ---------------------------------------------------------------------------

const splitClasses = (s: string) => s.split(/\s+/).filter(Boolean);

function stringValue(expr: Node | undefined): string | undefined {
  if (!expr) return undefined;
  if (Node.isStringLiteral(expr) || Node.isNoSubstitutionTemplateLiteral(expr)) {
    return expr.getLiteralText();
  }
  if (Node.isArrayLiteralExpression(expr)) {
    return expr
      .getElements()
      .map((e) => stringValue(e) ?? "")
      .join(" ");
  }
  if (Node.isParenthesizedExpression(expr)) return stringValue(expr.getExpression());
  return undefined;
}

function objectProp(obj: ObjectLiteralExpression, name: string) {
  const prop = obj.getProperty(name);
  if (prop && Node.isPropertyAssignment(prop)) return prop.getInitializer();
  return undefined;
}

function pascal(file: string) {
  return file
    .split(/[-_.]/)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join("");
}

/** Coleta strings literais e chamadas `xVariants(...)` dentro de `cn(...)`. */
function collectClassSources(expr: Expression | undefined) {
  const classes: string[] = [];
  let variants: string | undefined;
  const visit = (node: Node) => {
    const s = stringValue(node);
    if (s !== undefined) {
      classes.push(...splitClasses(s));
      return;
    }
    if (Node.isCallExpression(node)) {
      const callee = node.getExpression().getText();
      if (/Variants$/.test(callee)) variants = callee;
      node.getArguments().forEach(visit);
      return;
    }
    if (Node.isConditionalExpression(node) || Node.isBinaryExpression(node)) {
      node.forEachChild(visit);
    }
  };
  if (expr) visit(expr);
  return { classes, variants };
}

function parseCva(call: CallExpression, name: string): VariantConfig {
  const [baseArg, configArg] = call.getArguments();
  const config: VariantConfig = {
    name,
    base: splitClasses(stringValue(baseArg) ?? ""),
    variants: {},
    defaults: {},
  };
  if (configArg && Node.isObjectLiteralExpression(configArg)) {
    const variants = objectProp(configArg, "variants");
    if (variants && Node.isObjectLiteralExpression(variants)) {
      for (const dim of variants.getProperties()) {
        if (!Node.isPropertyAssignment(dim)) continue;
        const options = dim.getInitializer();
        if (!options || !Node.isObjectLiteralExpression(options)) continue;
        const dimName = dim.getName().replace(/^["']|["']$/g, "");
        config.variants[dimName] = {};
        for (const opt of options.getProperties()) {
          if (!Node.isPropertyAssignment(opt)) continue;
          const optName = opt.getName().replace(/^["']|["']$/g, "");
          config.variants[dimName][optName] = splitClasses(
            stringValue(opt.getInitializer()) ?? "",
          );
        }
      }
    }
    const defaults = objectProp(configArg, "defaultVariants");
    if (defaults && Node.isObjectLiteralExpression(defaults)) {
      for (const d of defaults.getProperties()) {
        if (!Node.isPropertyAssignment(d)) continue;
        const v = stringValue(d.getInitializer());
        if (v !== undefined) config.defaults[d.getName()] = v;
      }
    }
  }
  return config;
}

function enclosingComponentName(node: Node): string | undefined {
  let current: Node | undefined = node;
  while (current) {
    if (Node.isFunctionDeclaration(current) && current.getName()) {
      return current.getName();
    }
    if (Node.isVariableDeclaration(current)) {
      const name = current.getName();
      if (/^[A-Z]/.test(name)) return name;
    }
    current = current.getParent();
  }
  return undefined;
}

function extractComponents(
  dir: string,
  meta: { id: string; label: string; importPath: string },
): DesignSystemKnowledge {
  const knowledge: DesignSystemKnowledge = {
    ...meta,
    slots: {},
    signatures: [],
    variantConfigs: {},
    docs: {},
  };
  if (!fs.existsSync(dir)) {
    console.warn(`  ! diretório não encontrado: ${dir}`);
    return knowledge;
  }
  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    compilerOptions: { jsx: 4 /* ReactJSX */ },
  });
  const files = fs
    .readdirSync(dir, { recursive: true, encoding: "utf8" })
    .filter((f) => f.endsWith(".tsx") && !/\.(figma|stories|test)\.tsx$/.test(f));

  for (const rel of files) {
    const source = project.addSourceFileAtPath(path.join(dir, rel));
    const family = pascal(path.basename(rel, ".tsx"));

    for (const decl of source.getVariableDeclarations()) {
      const init = decl.getInitializer();
      if (init && Node.isCallExpression(init) && init.getExpression().getText() === "cva") {
        knowledge.variantConfigs[decl.getName()] = parseCva(init, decl.getName());
      }
    }

    // Uma entrada por parte (função/const React em PascalCase): o primeiro
    // elemento JSX que declara data-slot e/ou className.
    const seenParts = new Set<string>();
    const openings = [
      ...source.getDescendantsOfKind(SyntaxKind.JsxOpeningElement),
      ...source.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement),
    ].sort((a, b) => a.getStart() - b.getStart());

    for (const opening of openings) {
      const attr = (name: string) => {
        const a = opening
          .getAttributes()
          .find((x) => Node.isJsxAttribute(x) && x.getNameNode().getText() === name);
        return a && Node.isJsxAttribute(a) ? a : undefined;
      };
      const slotAttr = attr("data-slot");
      const classAttr = attr("className");
      if (!slotAttr && !classAttr) continue;

      const slot = slotAttr ? stringValue(slotAttr.getInitializer()) : undefined;
      const part = enclosingComponentName(opening) ?? (slot ? pascal(slot) : undefined);
      if (!part) continue;
      // Com data-slot, cada slot conta; sem ele, só o primeiro elemento da parte.
      if (slot ? knowledge.slots[slot] : seenParts.has(part)) continue;

      let baseClasses: string[] = [];
      let variants: string | undefined;
      if (classAttr) {
        const init = classAttr.getInitializer();
        const expr =
          init && Node.isJsxExpression(init) ? init.getExpression() : (init as Expression);
        const collected = collectClassSources(expr);
        baseClasses = collected.classes;
        variants = collected.variants;
      }
      if (!slot && !baseClasses.length && !variants) continue;

      const def: SlotDef = {
        family,
        part,
        element: opening.getTagNameNode().getText(),
        baseClasses,
      };
      if (slot) def.slot = slot;
      if (variants) def.variants = variants;
      if (slot) knowledge.slots[slot] = def;
      if (!seenParts.has(part) && (baseClasses.length || variants)) {
        knowledge.signatures.push(def);
      }
      seenParts.add(part);
    }
  }
  return knowledge;
}

function extractDocs(file: string): Record<string, string> {
  const docs: Record<string, string> = {};
  if (!fs.existsSync(file)) return docs;
  const project = new Project({ skipAddingFilesFromTsConfig: true });
  const source = project.addSourceFileAtPath(file);
  for (const obj of source.getDescendantsOfKind(SyntaxKind.ObjectLiteralExpression)) {
    const name = stringValue(objectProp(obj, "name"));
    const summary = stringValue(objectProp(obj, "summary"));
    if (name && summary && /^[A-Z]/.test(name) && !docs[name]) docs[name] = summary;
  }
  return docs;
}

// ---------------------------------------------------------------------------

console.log(`Omnia DS: ${omniaPath}`);
const tokens = extractTokens(
  path.join(omniaPath, "packages/tokens/src/styles/tokens.css"),
);
const omnia = extractComponents(path.join(omniaPath, "packages/ui/src/components"), {
  id: "omnia",
  label: "Omnia DS",
  importPath: "@omnia-ds/ui",
});
omnia.docs = extractDocs(path.join(omniaPath, "apps/docs/src/content.ts"));

const shadcn = baselines.map((b) => {
  console.log(`Baseline ${b.label}: ${b.dir}`);
  return extractComponents(b.dir, {
    id: b.id,
    label: b.label,
    importPath: "@/components/ui",
  });
});

const knowledge: Knowledge = {
  generatedAt: new Date().toISOString(),
  omnia,
  tokens,
  shadcn,
};

const out = path.join(root, "src/knowledge/knowledge.generated.json");
fs.writeFileSync(out, JSON.stringify(knowledge, null, 2) + "\n");
// Lista enxuta de variáveis para o content script ler na página.
fs.writeFileSync(
  path.join(root, "src/knowledge/token-names.generated.json"),
  JSON.stringify(tokens.map((t) => t.name)) + "\n",
);
console.log(
  `✓ ${tokens.length} tokens, ${Object.keys(omnia.slots).length} slots Omnia, ` +
    `${Object.keys(omnia.variantConfigs).length} configs cva, ` +
    `${Object.keys(omnia.docs).length} docs, ` +
    shadcn
      .map(
        (s) =>
          `${s.id}: ${Object.keys(s.slots).length} slots/${s.signatures.length} assinaturas`,
      )
      .join(", "),
);
console.log(`→ ${path.relative(root, out)}`);
