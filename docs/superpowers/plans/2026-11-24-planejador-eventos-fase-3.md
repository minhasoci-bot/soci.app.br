# Planejador de eventos · Fase 3 (linha do tempo) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ver e remarcar tarefas e mensagens numa linha do tempo, por evento e com todos os eventos juntos.

**Architecture:** `ui/event-timeline.js` tem funções puras (intervalo, grupos, HTML) e um instalador com arrastar e teclado. O salvamento usa a fila de gravações e a revisão que o planejador já tem; a data nova de mensagem agendada move a fila no servidor (Fase 2).

**Spec:** `docs/superpowers/specs/2026-11-23-planejador-eventos-paridade-design.md`, seção "Linha do tempo (Fase 3)"

**Base:** `feat/planejador-eventos-whatsapp` (PR #120)

## Global Constraints

- Regras das Fases 1 e 2: `ui/` é a fonte, CSS só com tokens, pt-BR, diálogos de `ui/ask.js`.
- Mensagem já enviada não se move. Mensagem agendada movida para o passado pede confirmação, porque sairia na hora.
- A coluna de nomes e os dias rolam no mesmo contêiner (coluna fixa por CSS), então não há sincronia por script.

## Review Focus

1. Arrastar mensagem agendada para o passado sem querer não dispara envio. → Task 2
2. Clique depois de arrastar não abre o diálogo; clique sem arrastar abre. → Task 2
3. Datas não escorregam um dia por fuso ou horário de verão. → Task 1
4. Salvar falha (409, rede): a barra volta para a data gravada e a pessoa é avisada. → Task 2
5. Um item com data muito distante não gera milhares de colunas nem trava a tela. → Task 1

### Task 1: Modelo e HTML

**Files:** Create `ui/event-timeline.js`; Test `test/event-timeline.test.mjs`

**Produces:** `shiftDay(iso, n)`, `timelineRange(dates, today) → { start, days, hasToday }`, `eventGroups(event)` (por fase), `galleryGroups(events)` (por evento, sem arquivados), `movable(event, item) → ''|motivo`, `timelineHtml({ groups, zoom, today, users })`, `leavesNow(event, item, date, zone, now) → boolean`.

Regras: intervalo com 7 dias antes e 14 depois, mínimo de 42; hoje entra se estiver a até 120 dias dos itens; no máximo 550 dias, centrado na mediana, e o que ficar de fora aparece como "fora do intervalo" na linha. Zoom `day` = 36 px, `week` = 14 px. Só tarefas e mensagens. Sem data: linha com "Sem data".

### Task 2: Arrastar e teclado

**Files:** Modify `ui/event-timeline.js`; Test `test/event-timeline.test.mjs`

**Produces:** `installTimeline({ find, itemOf, savePlan, openItem, repaint, flash, zone })`. Arrastar por pointer events, soltar salva; Esc cancela; setas movem um dia (gravação 600 ms depois da última tecla); Enter abre.

### Task 3: Encaixe na tela

**Files:** Modify `ui/event-planner.js`, `ui/event-planner.css`, `server.mjs` (`staticFiles`); Test `test/event-timeline.test.mjs`, `test/event-planner-view.test.mjs`

Seção "Linha do tempo" no evento, entre Links e Integrações. Na galeria, alternância Cartões / Linha do tempo. Botões Dia, Semana e Hoje. A rolagem horizontal se mantém ao redesenhar.

### Task 4: Verificação, revisão independente e PR

Suíte, lint, navegador (arrastar, teclado, 409, temas, 375 px), revisor na branch, correções com teste que falha antes. Push e PR só com autorização.
