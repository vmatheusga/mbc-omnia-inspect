import type { CodeSnippets, ComponentIdentity, ElementSnapshot, TokenUsage } from "./types";

const escapeText = (s: string) => s.replace(/[{}<>]/g, (c) => `{"${c}"}`);

export function buildSnippets(
  el: ElementSnapshot,
  component: ComponentIdentity,
  tokens: TokenUsage[],
): CodeSnippets {
  const text = el.text?.trim() ? escapeText(el.text.trim().slice(0, 60)) : "";
  const classes = el.classes.join(" ");

  let importLine: string | undefined;
  let jsx: string;

  if (component.kind === "omnia" || (component.kind === "shadcn" && component.importPath)) {
    const name = component.name;
    importLine = `import { ${name} } from "${component.importPath}";`;
    const props: string[] = [];
    for (const v of component.variants) {
      if (!v.isDefault) props.push(`${v.dimension}="${v.value}"`);
    }
    for (const key of ["disabled", "type", "href", "placeholder"]) {
      if (key in el.attrs && !(key === "type" && el.attrs.type === "button")) {
        props.push(el.attrs[key] ? `${key}="${el.attrs[key]}"` : key);
      }
    }
    if (component.extraClasses.length) props.push(`className="${component.extraClasses.join(" ")}"`);
    const open = [name, ...props].join(" ");
    jsx = text ? `<${open}>${text}</${name}>` : `<${open} />`;
  } else {
    const tag = component.kind === "react" ? component.name : el.tag;
    const attrs = classes ? ` className="${classes}"` : "";
    jsx = text ? `<${tag}${attrs}>${text}</${tag}>` : `<${tag}${attrs} />`;
  }

  const seen = new Set<string>();
  const cssVars = tokens
    .filter((t) => t.token?.startsWith("--") && !t.token.includes("×") && !t.token.includes("/"))
    .filter((t) => (seen.has(t.token!) ? false : (seen.add(t.token!), true)))
    .map((t) => `${t.token}: ${t.display};${t.utility ? ` /* ${t.utility} */` : ""}`)
    .join("\n");

  return { importLine, jsx, classes, cssVars };
}
