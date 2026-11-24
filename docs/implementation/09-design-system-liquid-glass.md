# Design system: Liquid Glass

Entrega de 24/11/2026. Base: [Adopting Liquid Glass](https://developer.apple.com/documentation/TechnologyOverviews/adopting-liquid-glass) e as páginas Materials e Color do HIG, adaptadas para web.

## Onde fica cada coisa

| Arquivo | Papel |
| --- | --- |
| `ui/tokens.css` | Fonte única: cor, material, forma, texto, movimento, claro, escuro, contraste alto e transparência reduzida. Carrega logo depois de `style.css`. |
| `ui/liquid-glass.css` | Vidro (navegação, topo, menus, folhas, avisos, barras flutuantes), conteúdo, abas e campos. Última folha carregada. |
| `ui/button-system.css` | Botões: primário, secundário, destrutivo, ícone. |
| `ui/graao.css` | Componentes base. Não define mais tokens. |
| `ui/graao-dark.css` | Gerado por `npm run build:dark` a partir das cores fixas que ainda existem. |

Depois de mexer em `ui/`: `npm run build:dark` e `node scripts/sync-public.mjs`.

## Regras

1. **Vidro é navegação e controle.** Menu lateral, grupos do topo, menus, folhas, avisos e barras que flutuam sobre uma tela de edição. Card, tabela e formulário são sólidos. A lista de quem recebe vidro é a seção 1 de `liquid-glass.css`.
2. **Nunca vidro sobre vidro.** Dentro do vidro, o estado é `--lg-tint-on`.
3. **Cor de marca em dois lugares:** ação principal (`--g-brand-fill` com `--g-brand-on`) e item ativo. Texto e ícone da marca usam `--g-brand-text`. O gradiente fica no logo (`--g-grad-logo`).
4. **Formas concêntricas.** `--r-sheet` 28, `--r-card` 20, `--r-group` 16, `--r-control` 12, `--r-chip` 8, cápsula em botões, busca e abas. Raio do filho = raio do pai − respiro.
5. **Sem barra no topo.** Os grupos flutuam, o conteúdo rola por baixo e o efeito de borda desfoca antes de encostar nos controles.
6. **Diálogo só escurece o fundo**, sem desfoque. Material espesso, porque tem muito texto.
7. **Rótulo em caixa normal**, linha de tabela mais alta, cabeçalho sem faixa.
8. **Botão de ícone precisa de `aria-label`.**

## Materiais

| Token | Uso |
| --- | --- |
| `--lg-regular` | Navegação, topo, menus, popovers. |
| `--lg-thick` | Diálogos e avisos. |
| `--lg-clear` (classe `.lg-clear`) | Só sobre foto ou vídeo. Já traz `--lg-dim` a 35%. |

Para um controle novo: classe `.lg-glass`, e só se ele flutuar sobre conteúdo.

## Acessibilidade

- `prefers-reduced-transparency`: materiais opacos, mesma hierarquia.
- `prefers-contrast: more`: linhas e contornos visíveis, texto mais escuro, seleção com borda.
- `prefers-reduced-motion`: sem deslocamento nem mola.
- `forced-colors` e navegador sem `backdrop-filter`: borda e fundo sólidos.
- Foco de teclado em `--g-ink`, visível em qualquer marca.
- Marca da agência: `applyBrandColor` escolhe texto claro ou escuro pelo contraste, e `--g-brand-text` ajusta a luminosidade da cor escolhida.

`test/design-system.test.mjs` trava contraste, dono dos tokens, cobertura dos materiais e ordem das folhas.

## Decisões

- **Sem refração por SVG** (`backdrop-filter: url()`): só funciona no Chromium e custa caro em telas densas. O efeito vem de desfoque, saturação e borda especular.
- **Plus Jakarta Sans continua.** A SF não pode ser distribuída na web.
- **A agência mantém a aurora**, a 62%, porque é ela que distingue agência de subconta e dá ao vidro o que refratar.
- **Botão secundário é preenchimento neutro, não vidro**, porque fica no conteúdo.
- **O brilho que seguia o cursor saiu** (CSS e JS): era efeito próprio sobre o controle.
- **Fora desta entrega:** landing, login, portal do cliente, comunidade e o editor de apresentações, que têm identidade própria ou do cliente.
