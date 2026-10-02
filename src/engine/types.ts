import type { PropertySection } from "./properties";

// ---------------------------------------------------------------------------
// Knowledge base (gerado por scripts/sync-omnia.ts)
// ---------------------------------------------------------------------------

export type TokenKind =
  | "color"
  | "primitive-color"
  | "radius"
  | "shadow"
  | "text"
  | "weight"
  | "font";

export interface TokenDef {
  /** Variável CSS, ex.: `--primary`, `--radius-md`. */
  name: string;
  kind: TokenKind;
  /** Sufixo da utility Tailwind, ex.: `primary` (bg-primary), `md` (rounded-md). */
  utility?: string;
  light?: string;
  dark?: string;
  /** Tokens de tipografia: line-height pareado (`--text-sm--line-height`). */
  lineHeight?: string;
}

export interface VariantConfig {
  /** Nome da constante cva, ex.: `buttonVariants`. */
  name: string;
  base: string[];
  variants: Record<string, Record<string, string[]>>;
  defaults: Record<string, string>;
}

export interface SlotDef {
  /** Valor de `data-slot`, ex.: `card-header` (ausente em shadcn v3). */
  slot?: string;
  /** Família (arquivo), ex.: `Card`. */
  family: string;
  /** Função React que renderiza o slot, ex.: `CardHeader`. */
  part: string;
  /** Tag/elemento renderizado, ex.: `div`, `DialogPrimitive.Content`. */
  element?: string;
  baseClasses: string[];
  /** Nome da config cva usada, se houver. */
  variants?: string;
}

export interface DesignSystemKnowledge {
  id: string;
  label: string;
  importPath: string;
  slots: Record<string, SlotDef>;
  /** Todas as partes com classes base (com ou sem data-slot), para casar por classes. */
  signatures: SlotDef[];
  variantConfigs: Record<string, VariantConfig>;
  /** Resumos da documentação por componente (família ou parte). */
  docs: Record<string, string>;
}

export interface Knowledge {
  generatedAt: string;
  omnia: DesignSystemKnowledge;
  tokens: TokenDef[];
  shadcn: DesignSystemKnowledge[];
}

// ---------------------------------------------------------------------------
// Snapshot do DOM (coletado pelo content script, serializável)
// ---------------------------------------------------------------------------

export type Theme = "light" | "dark";

export interface ReactInfo {
  /** Componente React dono do nó (se identificável). */
  name?: string;
  props?: Record<string, string | number | boolean | null>;
  /** Cadeia de componentes acima (mais próximo primeiro). */
  owners?: string[];
}

export interface NodeRef {
  /** Id interno para o content script localizar o elemento. */
  id: string;
  tag: string;
  slot?: string;
  classes: string[];
  attrs: Record<string, string>;
  text?: string;
  react?: ReactInfo;
}

export interface ElementSnapshot extends NodeRef {
  inlineStyle?: string;
  /** Subconjunto de getComputedStyle. */
  styles: Record<string, string>;
  /** Cor de texto do pai (para detectar herança). */
  parentColor?: string;
  parentStyles?: Record<string, string>;
  rect: { x: number; y: number; width: number; height: number };
  /** Fundo efetivo (primeiro ancestral opaco). */
  effectiveBackground: string;
  accessibleName?: string;
  hasDirectText: boolean;
  focusable: boolean;
  cursorPointer: boolean;
  childElementCount: number;
}

export interface PageContext {
  url: string;
  theme: Theme;
  rootFontSize: number;
  /** Valores vivos das variáveis de token lidas do :root. */
  tokenValues: Record<string, string>;
  /** Largura da viewport (window.innerWidth) — decide quais breakpoints estão ativos. */
  viewportWidth?: number;
}

export interface InspectInput {
  element: ElementSnapshot;
  /** Ancestrais do mais próximo ao mais distante. */
  ancestors: NodeRef[];
  /** Filhos diretos/próximos com data-slot (ou filhos diretos). */
  children: NodeRef[];
  page: PageContext;
}

// ---------------------------------------------------------------------------
// Resultado da análise (enviado ao painel; mesmo payload servirá para IA)
// ---------------------------------------------------------------------------

export type ComponentKind = "omnia" | "shadcn" | "react" | "native";

export interface VariantGuess {
  dimension: string;
  value: string;
  confidence: number;
  source: "react" | "atributo" | "classes" | "padrão";
  isDefault: boolean;
}

export interface ComponentIdentity {
  kind: ComponentKind;
  name: string;
  family?: string;
  part?: string;
  slot?: string;
  /** O slot está no próprio elemento (true) ou num ancestral (false). */
  isSelf: boolean;
  confidence: number;
  reasons: string[];
  summary?: string;
  variants: VariantGuess[];
  designSystem?: string;
  importPath?: string;
  reactOwners?: string[];
  /** Classes além das definidas pelo componente (customizações). */
  extraClasses: string[];
}

export type TokenGroup =
  | "Cor"
  | "Tipografia"
  | "Espaçamento"
  | "Dimensões"
  | "Raio"
  | "Sombra"
  | "Efeitos";

export interface TokenUsage {
  group: TokenGroup;
  property: string;
  label: string;
  value: string;
  display: string;
  token?: string;
  alternatives?: string[];
  utility?: string;
  source: "classe" | "valor" | "herdado" | "fora do padrão" | "escala";
  swatch?: string;
  alpha?: number;
}

export interface StateToken {
  state: string;
  utility: string;
  token?: string;
  property: string;
}

export type Severity = "error" | "warning" | "info";

export interface Finding {
  severity: Severity;
  category: "token" | "classe" | "inline" | "componente" | "a11y";
  title: string;
  detail?: string;
  suggestion?: string;
}

export interface ContrastInfo {
  ratio: number;
  foreground: string;
  background: string;
  largeText: boolean;
  aa: boolean;
  aaa: boolean;
}

export interface A11yInfo {
  role?: string;
  implicitRole: boolean;
  name?: string;
  focusable: boolean;
  tabIndex?: string;
  states: Array<{ key: string; value: string }>;
  aria: Array<{ key: string; value: string }>;
  contrast?: ContrastInfo;
}

export interface TreeNode {
  id: string;
  label: string;
  detail?: string;
  kind: ComponentKind;
}

export interface CodeSnippets {
  importLine?: string;
  jsx: string;
  classes: string;
  cssVars: string;
}

export interface InspectionResult {
  element: {
    id: string;
    tag: string;
    selector: string;
    text?: string;
    width: number;
    height: number;
  };
  component: ComponentIdentity;
  tokens: TokenUsage[];
  stateTokens: StateToken[];
  findings: Finding[];
  a11y: A11yInfo;
  code: CodeSnippets;
  tree: { ancestors: TreeNode[]; children: TreeNode[] };
  page: { theme: Theme; url: string; usesOmniaTokens: boolean; viewportWidth?: number; breakpoint: string };
  responsive: ResponsiveRule[];
  boxModel: BoxModel;
  properties: PropertySection[];
}

export interface ResponsiveRule {
  /** `base`, `sm`, `md`… ou `max-md`. */
  breakpoint: string;
  /** Largura mínima (ou máxima, para max-*) em px. */
  width: number;
  active: boolean;
  classes: string[];
}

export interface BoxSides {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface BoxModel {
  margin: BoxSides;
  border: BoxSides;
  padding: BoxSides;
  /** Área de conteúdo (sem padding e borda). */
  content: { width: number; height: number };
  /** Caixa inteira (border-box). */
  size: { width: number; height: number };
  boxSizing: string;
  display: string;
  position: string;
  /** Classe/token por lado, ex.: `padding-top` → `p-4 · --spacing × 4`. */
  hints: Record<string, string>;
}
