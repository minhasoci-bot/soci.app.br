# App móvel no estilo da comunidade — plano de construção

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Execução nativa, nesta sessão (o usuário aprovou
> o desenho e pediu para construir). Sem commits: commit, push e PR só quando o usuário pedir.

**Goal:** redesenhar o criador e o app móvel com a estética da comunidade, com a tela Início e a prévia fiel.

**Architecture:** funções puras de HTML (`ui/mobile-app-view.js`) e um CSS só (`ui/mobile-app.css`, com `--cm-*`) usados pelo
app, pela página de entrada e pela prévia. O tema reaproveita `ui/community-data.js`. O modo app liga `data-app-mode` no
`<html>` e mapeia `--g-*` para `--cm-*` em `ui/tokens.css`.

**Tech Stack:** JS puro (ES modules), `node --test`, Biome, TypeScript (checagem), Starlight (docs).

**Spec:** `docs/superpowers/specs/2026-11-25-app-movel-comunidade-design.md`

## Global Constraints

- Fonte do front-end em `ui/`; `public/` só por `node scripts/sync-public.mjs`.
- Tokens só em `ui/tokens.css`; formulários em `.set-form`; nada de `confirm/alert/prompt`.
- Textos em português, com espanhol em `ui/locales/es.js`.
- Fora do modo app nada muda. Apps já publicados mantêm cor principal, ordem, ocultos e links.

## Review Focus

1. App salvo sem `theme`, `home` e `cover` (agência antiga): abre com a cor antiga e a Início ligada.
2. Pessoa com acesso só a Conversas: abas sem módulos proibidos, Início só com os blocos dela.
3. Cor principal clara (amarelo, branco): texto sobre o botão legível em claro e escuro.
4. Agendamento perto da meia-noite com fuso da subconta diferente do aparelho: "hoje" é o dia da subconta.
5. Criador com alterações não salvas: trocar de seção, publicar e sair não perdem nada sem avisar.

### Task 1: Tema e dados

**Files:** Modify `ui/community-data.js`, `community-config.mjs`, `agency-mobile.mjs`, `agency-model.mjs`, `routes/agency-apps.mjs`; Test `test/mobile-app.test.mjs`, `test/community-settings.test.mjs` (sem mudança, precisa passar)

**Interfaces (Produces):**
- `ui/community-data.js`: `cleanTheme(input) → { theme, error }` (validação compartilhada; `error` é a mensagem ou `''`),
  `themeFromColor(primary) → { preset:'custom', tokens }`.
- `agency-mobile.mjs`: `mobileOf(state)` com `home:true`, `cover:''`, `theme:null`; `mobileTheme(app)`;
  `saveMobileLook(app, d)`; `mobileConfig` com `theme`, `home`, `phrase`; rota `cover`.

- [ ] Testes: `themeFromColor('#ffe600')` tem contraste ≥ 4,5 entre `primary` e `onPrimary`, e em `themeMode` claro/escuro;
  app antigo → `config.theme.tokens.primary` igual à cor salva, `config.home === true`; `mobile-app` com tema `floresta`
  → `manifest.theme_color === '#1f7a4d'`; cor inválida → 400; capa PNG salva, servida em `/mobile/agency/cover`, removida
  com `'remove'`; salvar sem `theme`/`home`/`cover` não apaga o que existe.
- [ ] Implementar e rodar `node --test test/mobile-app.test.mjs test/community-settings.test.mjs`.

### Task 2: Peças compartilhadas e entrada

**Files:** Create `ui/mobile-app-view.js`, `ui/mobile-app.css`; Modify `agency-mobile.mjs` (`mobileLaunchPage`, `mobileCsp`), `server.mjs` (estáticos), `ui/app.html`

**Interfaces (Produces):** `mobileRoutes`, `mobileLabels`, `mobileIcons`, `barSplit(config, allowed) → { tabs, more }`,
`entryView(o)`, `headerView(o)`, `tabsView(o)`, `sheetView(o)`, `homeView(data)`, `sampleHome()`.

- [ ] Testes: `barSplit` com Início = Início + 3; sem Início = 4; módulos proibidos fora; a entrada traz nome, frase, capa,
  escapa HTML e mantém `href="/app?shell=mobile&amp;agency=agency#home"`, manifesto e service worker.
- [ ] Implementar e rodar os testes.

### Task 3: Moldura e Início

**Files:** Create `ui/mobile-home-data.js`; Modify `ui/mobile-shell.js`, `ui/app.js`, `ui/graao.js`, `ui/tokens.css`; Test `test/mobile-home.test.mjs`

**Interfaces (Produces):** `homeData(state, { allowed, name, now }) → { greeting, name, replies, agenda, tasks, deals, blocks, empty }`;
`installMobileShell` define `screens.home`; `setThemeFallback(theme)` em `graao.js`; `data-app-mode` no `<html>`.

- [ ] Testes de `homeData`: saudação por hora no fuso; até 5 itens; só não lidas recebidas; agenda do dia no fuso, sem
  cancelados; tarefas abertas vencidas ou de hoje; blocos por permissão; `empty` só com tudo vazio.
- [ ] Implementar; `#home` fora do modo app cai na tela padrão; visão da agência sem modo app.

### Task 4: Conversas na lista

**Files:** Modify `ui/inbox.js`. `inboxState` começa com `nav` fechado até 760 px. Teste em `test/mobile-home.test.mjs` com `matchMedia` simulado.

### Task 5: Criador

**Files:** Modify `ui/agency-mobile.js` (página, rascunho, prévia, eventos), `ui/agency.js` (delegar), `ui/agency.css`, `ui/graao-dark.css` (gerado), `ui/locales/es.js`; Test `test/mobile-app.test.mjs`

**Interfaces (Produces):** `createMobileCreator(env) → { page(), input(el), click(action, el), submit(form), dirty() }`.

- [ ] Rascunho único; salvar chama `mobile-app` e, com mudança nas lojas ou no ícone, `mobile-app-store`; publicar salva antes.
- [ ] Sair com alterações pede `ask`.

### Task 6: Checagens, navegador e documentação

- [ ] `npm test`, `npm run lint`, `npm run typecheck`, `node scripts/sync-public.mjs`.
- [ ] Navegador: matriz da spec (criador 1360/1024/375; app 320/375; claro/escuro), capturas, console limpo.
- [ ] Artigo, novidades, `docs:secoes`, `cobertura.json`, `docs:test`, `docs:build`.
