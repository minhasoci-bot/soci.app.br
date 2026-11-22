# Beautiful UI (registry original)

Cópia do registry shadcn de https://www.beautifului.dev (licença MIT, Shane Levine), baixada em 2026-11-21.

- `r/` guarda o JSON de cada item (27 no total) como o site serve em `/r/<nome>.json`.
- `src/` guarda os fontes extraídos desses JSON (React/TSX + `foundation.css` com Tailwind v4).

O soci.app não usa React nem Tailwind, então nada daqui é servido. A versão em uso foi portada para JS puro:

- `ui/beautiful-ui.js`: `loadingState`, `thinkingState`, `shimmer`, `streamText`, `streamCaret`, `toolChips`,
  `approvalCard`, `taskRows`, `recommendationCard`, `contextCards`, e os átomos `button`, `monogram`,
  `entityChip`, `valuePill`, `glideMenu`
- `ui/beautiful-ui.css`: tokens `--bui-*` apontando para os tokens `--g-*` do app (tema claro/escuro e marca)

- `ui/beautiful-ui-more.js`: `searchList`, `filterTable`, `codeBlock`, `diffTable`, `streamingText`,
  `chatComposer`, `promptBar`, `sidebarNav`, `flowchart`, `insightCards` (+ `lineChart`, `mention`, `monoValue`),
  `fineTuneCard` (+ `scrubField`), `selectionActions`, `recordsTable`

Todos os 27 itens estão portados. Vitrine com todos em `/beautiful-ui.html` (dados de exemplo).

Em uso no app: chat Pergunte à Soci (loader, raciocínio, cursor), teste de agentes (loader) e "Testar a busca"
das bases de conhecimento (ContextCards).

Diferenças em relação ao original:
- InsightCards usa um gráfico SVG próprio (`lineChart`) no lugar da lib `liveline`.
- O brilho arco-íris do PromptBar ao trocar de modelo é um gradiente CSS no lugar do shader `glimm`.
- Os ícones `iconoir-react` e `@central-icons-react` viraram SVGs inline.
- Sem as demos automáticas: os componentes reagem a dados e callbacks reais (`onSend`, `onRun`, `compute`…).
- RecordsTable traz ordenação, seleção, redimensionamento, etiquetas com “+N” e a coluna de IA calculada linha a
  linha; o painel de configuração de propriedade do original (tipo, ferramenta, grounding) não foi portado.
