# Omnia Inspect

> [!WARNING]
> **Versão beta (0.1.0).** A extensão ainda está sendo otimizada: algumas telas podem mudar, a identificação de componentes pode errar em casos específicos e o desempenho em páginas muito grandes ainda está sendo melhorado. Encontrou um problema? Abra uma [issue](https://github.com/vmatheusga/mbc-omnia-inspect/issues) com o link da página e um print.

Extensão do Chrome no estilo "Dev Mode" para o **Omnia DS** (e shadcn/ui). Você liga o modo inspecionar, clica em qualquer elemento da página, e o painel lateral mostra:

- **Componente**: Omnia DS, shadcn local, componente React da aplicação ou HTML nativo. Mostra também a parte (ex.: `Card › CardHeader`), variante e tamanho (`variant="brand"`, `size="sm"`) e o grau de confiança da identificação.
- **Anatomia da camada**: box model no estilo do Figma, com margem, borda, padding e conteúdo, as medidas de cada lado e o `box-sizing`. Passe o mouse num valor para ver a classe e o token (`p-4 · --spacing × 4`); clique para copiar a classe.
- **Propriedades** (Lista | Código), no formato do Figma Dev Mode:
  - **Layout**: fluxo (horizontal/vertical/grade), largura e altura como **Preenchimento**, **Envolver** ou **Fixo**, espaço (gap), alinhamento, padding, margem, posição.
  - **Modos**: tema, breakpoint e tokens detectados.
  - **Cores** em Hex, RGB ou HSL, **Tipografia** e **Aparência** (raio, borda, sombra, opacidade), cada valor com o token (`--primary`, `--radius-md`…) e a classe Tailwind.
  - Unidades em px ou rem. No modo Código, cada seção vira um bloco copiável em **CSS**, **CSS + tokens** (`var(--primary)`, `calc(var(--spacing) * 4)`) ou **Tailwind**.
- **Alertas**: valores fora dos tokens, com sugestão do token mais próximo. Também aponta classes arbitrárias (`p-[13px]`), cores da paleta padrão do Tailwind, estilos inline, customizações por cima do componente e componente shadcn local que já existe no Omnia.
- **Acessibilidade**: role, nome acessível, foco, `data-state` e ARIA, e contraste WCAG com nota AA/AAA.
- **Código**: JSX pronto (`<Button variant="brand" size="sm">`), import, classes e variáveis CSS, tudo com botão de copiar.
- **Árvore**: pais e filhos do elemento. Passe o mouse para destacar na página e clique para selecionar.
- **Responsivo**: mostra a página dentro de molduras (iframes) com o tamanho exato de cada dispositivo. Assim as media queries e os breakpoints `sm/md/lg/xl/2xl` respondem de verdade.
  - **Um dispositivo**: Mobile, Tablet, Laptop, Desktop, cada breakpoint do Tailwind ou um tamanho personalizado, com botão de girar.
  - **Lado a lado**: todos os breakpoints ou os dispositivos que você escolher. Cada moldura rola de forma independente; na barra do palco, **Rolar juntos** espelha a rolagem e **Navegar juntos** (ligado por padrão) abre o mesmo link em todas.
  - Dá para navegar e usar **Inspecionar** dentro das molduras. A análise mostra o breakpoint daquele tamanho e quais classes `md:`/`lg:` estão ativas. `Esc` ou `×` fecha.
  - **Avançado**: emulação nativa do Chrome (a mesma do DevTools, para páginas que não funcionam em moldura). O botão **📷 Capturar** da barra do palco leva os tamanhos abertos para a aba Capturar.
- **Capturar** (prints e vídeo): a aba **Print | Vídeo** usa a emulação nativa, então cada tamanho é exato e as media queries respondem de verdade. O overlay azul e o palco nunca aparecem no resultado, e a página volta ao que estava (tamanho, tema, rolagem, inspeção).
  - **Print**: um ou mais tamanhos (breakpoints do Tailwind, dispositivos ou **W × H** próprio, que fica salvo). Área **Viewport**, **Página inteira** (inclusive apps em que quem rola é um painel, e páginas muito altas) ou **Elemento** selecionado (recorte em cada tamanho; avisa se ele sumir). Tema **Atual · Claro · Escuro · Os dois** (`prefers-color-scheme` + classe `.dark`), formato PNG/JPG/WebP, densidade 1x/2x/3x, congelar animações, esconder barras de rolagem, carregar imagens lazy e tempo de espera. Ao terminar: abrir galeria, baixar (`.zip` se forem várias) ou copiar.
  - **Galeria**: zoom, linha ou grade, tema claro e escuro lado a lado, **moldura de dispositivo** (celular, tablet ou navegador, escolhida pela largura) com fundo transparente/branco/cinza, copiar, baixar uma ou todas (`.zip`). Os nomes saem como `host-rota-md-768x1024@2x-escuro.png`. As 10 últimas sessões ficam no **Histórico**.
  - **Vídeo** (um tamanho por vez): MP4 (ou WebM se o Chrome não tiver H.264), 30 ou 60 quadros/s, tema, duração máxima e contagem regressiva. **Auto scroll** com velocidade em px/s (Lento 100 · Médio 250 · Rápido 500, ajustável ao vivo), só descer ou descer e voltar, suavização, pausas no início e no fim e parada automática ao chegar no fim. Durante a gravação o painel mostra o cronômetro, **Pausar** e **Parar**. `Alt` + `Shift` + `R` grava e para; o ícone da extensão mostra `REC`. Na página do vídeo dá para baixar o MP4 ou **exportar GIF** (largura e quadros/s à escolha).
- **Imagens**: lista tudo o que é imagem na página, separado em **Ícones · SVG** e **Imagens** (PNG, JPG, WebP, GIF, AVIF…), com nome, formato, dimensões, peso e quantas vezes aparece. Você pode renomear, localizar na página, copiar o código do SVG e baixar um arquivo, os selecionados ou tudo em `.zip` (pastas `svg/` e `imagens/`). Ícones também podem sair como PNG 1x/2x/3x.

> Para a moldura funcionar mesmo em sites que bloqueiam iframes, a extensão remove `X-Frame-Options`/`frame-ancestors` **só dos iframes daquela aba e daquele domínio**, enquanto o painel estiver aberto. Na emulação nativa (Avançado), o Chrome mostra a faixa "Omnia Inspect começou a depurar este navegador".

## Instalar no Chrome (rodando localmente)

A extensão ainda não está na Chrome Web Store. Por enquanto ela é instalada no modo desenvolvedor do Chrome, a partir de uma pasta no seu computador. Funciona no Chrome, Edge, Brave e Arc (qualquer navegador baseado em Chromium).

### Opção 1: baixar pronta (recomendado, não precisa de código)

1. Abra a página de [**Releases**](https://github.com/vmatheusga/mbc-omnia-inspect/releases/latest) e baixe o arquivo `omnia-inspect-0.1.0-chrome.zip`.
2. Descompacte o `.zip` (no Mac, dois cliques no arquivo). Vai aparecer uma pasta com o `manifest.json` dentro.
3. Mova essa pasta para um lugar fixo, por exemplo `Documentos/omnia-inspect`. **Não apague nem mova a pasta depois de instalar**: o Chrome lê a extensão direto dela.
4. No Chrome, digite `chrome://extensions` na barra de endereço e aperte `Enter`.
5. Ligue o **Modo do desenvolvedor**, no canto superior direito da página.
6. Clique em **Carregar sem compactação** (*Load unpacked*), no canto superior esquerdo, e escolha a pasta do passo 3 (a que tem o `manifest.json`).
7. O card **Omnia Inspect** aparece na lista. Fixe a extensão na barra: clique no ícone de quebra-cabeça 🧩 ao lado da barra de endereço e depois no alfinete 📌 ao lado de **Omnia Inspect**.
8. Abra qualquer site, clique no ícone da extensão e pronto: o painel lateral abre com o modo inspecionar ligado.

**Atualizar para uma versão nova:** baixe o `.zip` novo, substitua o conteúdo da pasta e clique em **↻ Recarregar** no card da extensão em `chrome://extensions`.

**Desinstalar:** em `chrome://extensions`, clique em **Remover** no card da extensão.

### Opção 2: gerar a partir do código

Use esta opção se você vai alterar a extensão. O build importa os tokens do Omnia DS de um repositório vizinho, então as duas pastas precisam estar lado a lado:

```
PROJETOS/
  omnia-ds/              monorepo do Omnia DS
  mbc-omnia-inspect/     este repositório
```

Você precisa do [Node.js](https://nodejs.org) 20 ou mais novo e do [pnpm](https://pnpm.io/installation).

1. Clone o repositório ao lado do `omnia-ds`:
   ```bash
   git clone https://github.com/vmatheusga/mbc-omnia-inspect.git
   ```
2. Entre na pasta, instale as dependências e gere o build:
   ```bash
   cd mbc-omnia-inspect
   ```
   ```bash
   pnpm install
   ```
   ```bash
   pnpm build
   ```
3. Siga os passos 4 a 7 da Opção 1, escolhendo a pasta `dist/chrome-mv3` deste projeto.

Depois de alterar o código, rode `pnpm build` de novo e clique em **↻ Recarregar** no card da extensão em `chrome://extensions`. Para gerar o `.zip` de distribuição, use `pnpm zip` (o arquivo sai em `dist/`).

### Problemas comuns

| Sintoma | Solução |
| --- | --- |
| "Manifesto ausente ou ilegível" ao carregar | Você escolheu a pasta errada. Selecione a pasta que tem o `manifest.json` direto dentro dela, não a pasta de cima. |
| A extensão sumiu ou aparece como "corrompida" | A pasta foi movida ou apagada. Coloque-a de volta no lugar ou carregue de novo. |
| O painel não reage na página | Recarregue a página (`⌘`/`Ctrl` + `R`) depois de instalar ou atualizar a extensão. |
| Faixa "Omnia Inspect começou a depurar este navegador" | É esperado ao usar a emulação nativa e a aba Capturar. Some quando a captura termina. |
| O Chrome avisa para desativar extensões do modo desenvolvedor | Clique em **Manter**. O aviso aparece porque a extensão não veio da Web Store. |

## Usar

- Clique no ícone da extensão para abrir o painel lateral. O modo inspecionar já começa ligado.
- Passe o mouse sobre a página: o contorno azul mostra o que será selecionado. A inspeção **continua ativa** depois de cada clique, como no Figma. Com uma seleção ativa, o hover nos outros elementos fica discreto (tracejado).
- Atalhos na página (com o modo inspecionar ligado):

| Ação | Resultado |
| --- | --- |
| Clique | Seleciona o **componente** mais próximo (clicar no texto ou no ícone de um Button seleciona o Button) |
| `Ctrl`/`⌘` + clique | Seleciona a **camada exata** (o `<svg>`, o `<span>`…) |
| Duplo clique | Entra um nível dentro do elemento selecionado |
| `Shift` + clique | Adiciona à seleção ou remove dela. Com 2 ou mais, o painel mostra a lista e o botão **Comparar**, com as propriedades iguais e diferentes |
| `Alt`/`Option` + passar o mouse | Mede a distância (px) entre o selecionado e o elemento sob o mouse |
| `↑` / `↓` / `←` / `→` | Pai, primeiro filho e irmãos do selecionado |
| `Enter` | Seleciona o elemento destacado |
| `Esc` | Sai do modo inspecionar. Pressione de novo para limpar a seleção |
| `Alt` + `Shift` + `C` | Liga ou desliga o modo inspecionar |

O painel tem um rodapé **Atalhos**, que pode ser recolhido, com essa mesma lista.

> O Chrome não permite extensões em páginas internas (`chrome://…`, Chrome Web Store).

## Como a identificação funciona

| Sinal | Uso |
| --- | --- |
| `data-slot` | Todo componente do Omnia DS (e do shadcn v4) marca o elemento: `data-slot="button"`, `data-slot="card-header"`… |
| Classes do componente | São comparadas com as classes base e as variantes `cva` extraídas do código do Omnia. Isso separa **Omnia** de **shadcn local**: por exemplo, `bg-brand` só existe no Omnia e `group/button` é marca do shadcn base-nova. |
| React Fiber | Em builds de desenvolvimento, lê o nome do componente e as props reais (`variant`, `size`), que dão confiança de 100%. |
| Variáveis CSS da página | Os tokens são lidos direto do elemento, então respeitam o `.dark` e o `--brand` de cada produto. |
| Assinatura de classes | Fallback para shadcn v3 (sem `data-slot`). |

## Atualizar a base de conhecimento do Omnia

Os tokens, componentes, variantes e textos da documentação vêm do código-fonte do Omnia DS. Quando o DS mudar:

```bash
pnpm sync:omnia
```

Por padrão o comando lê `../omnia-ds`. Você pode mudar isso com a variável de ambiente `OMNIA_DS_PATH`. O resultado vai para `src/knowledge/*.generated.json`. As referências de shadcn (new-york, base-nova, default) são lidas dos protótipos em `../prototipagem`; para usar outras, configure `SHADCN_BASELINES`.

## Desenvolvimento

```bash
pnpm playground
```

Abre `http://localhost:5178` com componentes reais do `@omnia-ds/ui` e exemplos fora do padrão. O painel roda na mesma página, então dá para desenvolver o motor e a interface sem recarregar a extensão.

```bash
pnpm test
```

```bash
pnpm e2e
```

`pnpm e2e` carrega a extensão compilada num Chrome for Testing e verifica a emulação de tamanhos, prints (temas, 2x, página inteira, elemento), gravação de vídeo com auto scroll, a coleta de imagens e a inspeção. Rode antes `pnpm build` e deixe o `pnpm playground` aberto.

```bash
pnpm dev
```

`pnpm dev` abre um Chrome separado com a extensão carregada e recarrega sozinho a cada alteração.

### Estrutura

```
src/
  engine/            motor de análise (TypeScript puro, testado com Vitest)
    identify.ts      qual componente é, e qual variante
    tokens.ts        propriedades computadas → tokens
    tailwind.ts      interpretação de classes utilitárias
    audit.ts         alertas de fora do padrão
    a11y.ts          role, nome acessível, contraste
    snippet.ts       JSX / classes / variáveis
  entrypoints/
    background.ts    abre o painel, atalhos, roteamento
    content/         overlay azul + seletor (injetado sob demanda)
    react-probe.content.ts   lê o React Fiber (main world)
    sidepanel/       painel lateral (React + tokens do Omnia)
    compare/         página de resultado: galeria de prints, player de vídeo, histórico
    offscreen/       codifica o vídeo (WebCodecs → MP4/WebM)
  capture/           prints e gravação (chrome.debugger): cdp, screenshot, recorder
  shared/            mensagens, IndexedDB das capturas, molduras, GIF, zip
  knowledge/         base gerada a partir do Omnia DS
scripts/sync-omnia.ts
playground/          página de testes com o Omnia real
```

### Próximos passos (fase 2)

- Botão "Explicar/Sugerir com IA", que envia o `InspectionResult` (já serializável) para o Claude.
- Forçar os estados `:hover` e `:focus` via `chrome.debugger`.
- Medir a distância entre dois elementos (segurando `Alt`, como no Figma).
- Publicar na Chrome Web Store privada da organização.
