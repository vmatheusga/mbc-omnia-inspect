import type { InspectionResult } from "../../../engine/types";
import { CopyButton, Section } from "./ui";

function CodeBlock({ title, code, hint }: { title: string; code: string; hint?: string }) {
  if (!code) return null;
  return (
    <Section title={title} action={<CopyButton text={code} label={`Copiar ${title.toLowerCase()}`} />}>
      <pre className="max-h-56 overflow-auto rounded-sm border border-border bg-muted px-3 py-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-all text-foreground">
        {code}
      </pre>
      {hint && <p className="-mt-1 text-2xs text-muted-foreground">{hint}</p>}
    </Section>
  );
}

export function CodePanel({ result }: { result: InspectionResult }) {
  const { code, component } = result;
  const full = [code.importLine, code.importLine ? "" : undefined, code.jsx].filter((l) => l !== undefined).join("\n");
  return (
    <div className="flex flex-col gap-4">
      <CodeBlock
        title="JSX"
        code={full}
        hint={
          component.kind === "omnia"
            ? "Props omitidas quando iguais ao padrão do componente."
            : component.kind === "native"
              ? "Elemento sem componente do DS — snippet com as classes atuais."
              : undefined
        }
      />
      {component.extraClasses.length > 0 && (component.kind === "omnia" || component.kind === "shadcn") && (
        <CodeBlock
          title="Classes extras (customização)"
          code={component.extraClasses.join(" ")}
          hint="Classes além das definidas pelo componente e suas variantes."
        />
      )}
      <CodeBlock title="Classes" code={code.classes} />
      <CodeBlock title="Variáveis CSS" code={code.cssVars} />
    </div>
  );
}
