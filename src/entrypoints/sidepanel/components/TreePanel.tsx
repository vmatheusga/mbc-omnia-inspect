import { CornerDownRight } from "lucide-react";
import type { InspectionResult, TreeNode } from "../../../engine/types";
import type { Inspector } from "../useInspector";
import { KIND_META, Section, cx } from "./ui";

const DOT: Record<TreeNode["kind"], string> = {
  omnia: "bg-brand",
  shadcn: "bg-info",
  react: "bg-success",
  native: "bg-muted-foreground/40",
};

function NodeButton({
  node,
  depth,
  inspector,
  current,
}: {
  node: TreeNode;
  depth: number;
  inspector: Inspector;
  current?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={current}
      onClick={() => inspector.select(node.id)}
      onMouseEnter={() => inspector.highlight(node.id)}
      onMouseLeave={() => inspector.highlight(null)}
      className={cx(
        "flex w-full items-center gap-1.5 rounded-xs py-1 pr-2 text-left text-xs hover:bg-accent",
        current && "bg-info-subtle text-info-subtle-foreground hover:bg-info-subtle",
      )}
      style={{ paddingLeft: 6 + depth * 10 }}
      title={KIND_META[node.kind].label}
    >
      <span className={cx("size-1.5 shrink-0 rounded-full", DOT[node.kind])} />
      <span className={cx("truncate", node.kind !== "native" && "font-medium")}>{node.label}</span>
      {node.detail && <span className="ml-auto shrink-0 truncate font-mono text-2xs text-muted-foreground">{node.detail}</span>}
    </button>
  );
}

export function TreePanel({ result, inspector }: { result: InspectionResult; inspector: Inspector }) {
  const ancestors = [...result.tree.ancestors].reverse();
  const onlyComponents = ancestors.filter((n) => n.kind !== "native");
  const shown = onlyComponents.length ? onlyComponents : ancestors.slice(-6);
  const self: TreeNode = {
    id: result.element.id,
    label: result.component.name,
    kind: result.component.kind,
    detail: result.component.slot ? `data-slot=${result.component.slot}` : result.element.tag,
  };
  return (
    <div className="flex flex-col gap-4">
      <Section title="Hierarquia">
        <div className="flex flex-col">
          {shown.map((node, i) => (
            <NodeButton key={node.id} node={node} depth={i} inspector={inspector} />
          ))}
          <NodeButton node={self} depth={shown.length} inspector={inspector} current />
          {result.tree.children.map((child) => (
            <div key={child.id} className="flex items-center">
              <NodeButton node={child} depth={shown.length + 1} inspector={inspector} />
            </div>
          ))}
        </div>
        {onlyComponents.length > 0 && ancestors.length > onlyComponents.length && (
          <p className="flex items-center gap-1 text-2xs text-muted-foreground">
            <CornerDownRight className="size-3" />
            Mostrando apenas ancestrais que são componentes ({ancestors.length - onlyComponents.length} elementos HTML
            ocultos).
          </p>
        )}
      </Section>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-2xs text-muted-foreground">
        {(Object.keys(DOT) as TreeNode["kind"][]).map((kind) => (
          <span key={kind} className="flex items-center gap-1">
            <span className={cx("size-1.5 rounded-full", DOT[kind])} />
            {KIND_META[kind].label}
          </span>
        ))}
      </div>
    </div>
  );
}
