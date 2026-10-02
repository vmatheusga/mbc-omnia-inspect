import { Bell, Moon, Plus, Search, Sun, Trash2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Alert, AlertDescription, AlertTitle } from "omnia-ui/alert";
import { Badge } from "omnia-ui/badge";
import { Button } from "omnia-ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "omnia-ui/card";
import { Input } from "omnia-ui/input";
import { Label } from "omnia-ui/label";
import { Switch } from "omnia-ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "omnia-ui/tabs";
import { Toggle } from "omnia-ui/toggle";

function Block({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="flex flex-wrap items-start gap-3 rounded-lg border border-border bg-background p-4">{children}</div>
    </section>
  );
}

/** Botão com as classes do shadcn base-nova (não Omnia), como nos protótipos. */
function LocalShadcnButton({ children }: { children: ReactNode }) {
  return (
    <button
      data-slot="button"
      className="group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 bg-primary text-primary-foreground hover:bg-primary/80 h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2"
    >
      {children}
    </button>
  );
}

function ProductCard() {
  return (
    <Card className="w-72">
      <CardHeader>
        <CardTitle>Bíblia de Jerusalém</CardTitle>
        <CardDescription>Edição de estudo, capa dura</CardDescription>
      </CardHeader>
      <CardContent className="flex items-center gap-2">
        <Badge variant="success">Em estoque</Badge>
        <Badge variant="outline">Frete grátis</Badge>
      </CardContent>
      <CardFooter className="gap-2">
        <Button variant="brand" size="sm">
          <Plus /> Adicionar
        </Button>
        <Button variant="ghost" size="icon" aria-label="Remover">
          <Trash2 />
        </Button>
      </CardFooter>
    </Card>
  );
}

export function DemoPage() {
  const [dark, setDark] = useState(false);
  return (
    <div className={dark ? "dark" : undefined}>
      <div className="flex min-h-screen flex-col gap-8 bg-body-background p-8 text-foreground">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold">Playground Omnia Inspect</h1>
            <p className="text-sm text-foreground-alt">
              Componentes reais do <code>@omnia-ds/ui</code> + exemplos fora do padrão.
            </p>
          </div>
          <Button variant="outline" onClick={() => setDark((d) => !d)}>
            {dark ? <Sun /> : <Moon />} {dark ? "Light" : "Dark"}
          </Button>
        </header>

        <Block title="Botões Omnia" description="Variantes e tamanhos do buttonVariants.">
          <Button>Default</Button>
          <Button variant="brand">Brand</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Excluir</Button>
          <Button variant="info" size="sm">Info sm</Button>
          <Button variant="success" size="lg">Success lg</Button>
          <Button variant="warning" size="mini">Mini</Button>
          <Button variant="link">Link</Button>
          <Button size="icon" variant="outline" aria-label="Notificações">
            <Bell />
          </Button>
          <Button className="h-12 rounded-full px-8">Customizado</Button>
        </Block>

        <Block title="Composição" description="Card, Badge, Alert, Tabs e formulário.">
          <ProductCard />
          <div className="flex w-80 flex-col gap-3">
            <Alert variant="info">
              <Bell />
              <AlertTitle>Novidade</AlertTitle>
              <AlertDescription>O catálogo foi atualizado hoje.</AlertDescription>
            </Alert>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">E-mail</Label>
              <Input id="email" placeholder="voce@mbc.com.br" />
            </div>
            <div className="flex items-center gap-2">
              <Switch id="news" defaultChecked />
              <Label htmlFor="news">Receber novidades</Label>
              <Toggle variant="outline" size="sm" aria-label="Buscar">
                <Search />
              </Toggle>
            </div>
          </div>
          <Tabs defaultValue="resumo" className="w-72">
            <TabsList>
              <TabsTrigger value="resumo">Resumo</TabsTrigger>
              <TabsTrigger value="detalhes">Detalhes</TabsTrigger>
            </TabsList>
            <TabsContent value="resumo" className="text-sm text-muted-foreground">
              Conteúdo da aba resumo.
            </TabsContent>
          </Tabs>
        </Block>

        <Block title="Imagens" description="img, CSS background, SVG em arquivo e responsivo (flex-col md:flex-row).">
          <div className="flex w-full flex-col gap-3 md:flex-row">
            <img src="/capa-livro.jpg" alt="Capa do livro Bíblia de Jerusalém" className="size-16 rounded-md" />
            <img src="/logo-mbc.svg" alt="Logo MBC" className="h-8" />
            <img src="/selo.gif" alt="" className="size-12" />
            <div
              className="h-16 w-32 rounded-md bg-cover"
              style={{ backgroundImage: "url(/banner-hero.3f9a2c1b.png)" }}
              aria-label="Banner"
            />
          </div>
        </Block>

        <Block title="shadcn local" description="Componente com data-slot, mas com classes do shadcn base-nova.">
          <LocalShadcnButton>Salvar (base-nova)</LocalShadcnButton>
        </Block>

        <Block title="Fora do padrão" description="Valores que o inspetor deve apontar.">
          <div className="rounded-[7px] bg-[#ff4e4e] p-[13px] text-[15px] text-white">Cor e espaçamento arbitrários</div>
          <span className="rounded bg-red-500 px-3 py-1.5 text-sm text-white">Paleta do Tailwind</span>
          <p style={{ color: "#9aa0a6", padding: 7 }} className="bg-background text-sm">
            Estilo inline com baixo contraste
          </p>
          <button className="rounded-md border px-3 py-2 text-sm">Botão nativo</button>
          <button className="rounded-md bg-primary p-2 text-primary-foreground">
            <Trash2 className="size-4" />
          </button>
          <div className="cursor-pointer rounded-xl bg-card px-5 py-3 text-sm shadow-[0_3px_12px_rgb(0_0_0/0.2)]" onClick={() => {}}>
            Div clicável
          </div>
        </Block>
      </div>
    </div>
  );
}
