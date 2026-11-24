# Planejador de eventos · Fase 2 (envio pelo WhatsApp) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agendar e enviar de verdade as mensagens de grupo e privado do evento pela conexão Evolution da subconta.

**Architecture:** Agendar cria linhas em `eventSends` (uma por destino e por parte da mensagem). Um executor próprio, fora da fila das outras tarefas do cron, reserva uma linha por vez (`event-send-take`), envia e grava o resultado (`event-send-result`). O andamento fica em `event.deliveries[itemId]`, fora de `plan`, para o cron nunca disputar revisão com quem edita.

**Tech Stack:** Node 26 ESM, `node:test`, Evolution API v2.3.7, front-end em JS puro.

**Spec:** `docs/superpowers/specs/2026-11-23-planejador-eventos-paridade-design.md` (seções "Envio pelo WhatsApp" e "Modelo de lançamento: atualização")

**Base:** `feat/planejador-eventos` (PR #116). O PR desta fase é empilhado: base `feat/planejador-eventos` até o 116 ser mesclado.

## Global Constraints

- Tudo da Fase 1 continua valendo: `ui/` é a fonte e `node scripts/sync-public.mjs` após mexer nela; CSS só com tokens; textos em pt-BR; arquivos novos de UI registrados em `staticFiles`.
- Nunca enviar duas vezes a mesma linha. Na dúvida sobre ter saído, a linha falha como "envio não confirmado" e só uma pessoa reenvia.
- Nunca enviar a contato com `dnd`, conferido ao agendar **e** de novo ao enviar.
- Ritmo do privado: intervalo aleatório entre `minGapSeconds` (padrão 20, mínimo 10) e `maxGapSeconds` (padrão 60, máximo 300); `dailyCap` (padrão 150, 1–1000) por dia no fuso da subconta, contado em mensagens. Grupo: 3 s entre envios.
- Atrasada é enviada, não descartada. WhatsApp desconectado: linha continua `queued`, sem gastar tentativa.
- Limites: 1.000 contatos por mensagem, 20 grupos por destino, 4.000 caracteres por parte, 5.000 linhas em `eventSends` (ao passar, as concluídas mais antigas saem; os totais ficam em `deliveries`).
- Comandos internos (`event-send-take`, `event-send-result`) não entram em `commandModules`: o navegador recebe "Unknown operation.".
- Não fazer push até o usuário liberar: a Vercel está no limite diário de deploys.

## Decisões deste plano que mudam ou completam o spec

1. **Destino de grupo por evento, não por mensagem.** `event.groups = { base: [{jid,name}], evento: [{jid,name}] }`; a mensagem escolhe pelo campo `audience` que já existe. O spec previa `targets.groups` em cada uma das 27 mensagens.
2. **Repetição automática só quando é certo que não saiu:** não conectado, conexão recusada, 503 ou "Connection Closed". Timeout e outros 5xx ficam "não confirmado", sem repetição. O spec pedia repetir rede e 5xx, o que conflita com "não enviar duas vezes".
3. **`## Título` separa partes.** Cada parte é uma mensagem, 3 s entre partes do mesmo destino; o título não é enviado. Títulos que começam com Roteiro, Orientação, Antes de enviar ou Nota são internos e não saem. `## Enquete · Pergunta` vira enquete (2 a 12 opções), só em grupo; substitui os campos `format` e `pollOptions` do spec.
4. **Marcador esquecido bloqueia o agendamento:** qualquer `[texto]` nas partes a enviar.
5. **"Agendado" em grupo e privado só existe com fila.** A troca manual de status não oferece essa opção nesses canais; item antigo "Agendado" sem fila mostra "Sem envio programado".

## Review Focus

1. Cron duplicado ou lento: duas execuções ao mesmo tempo nunca reservam a mesma linha. → Tarefa 4
2. Processo morto entre enviar e gravar: a linha não é reenviada sozinha. → Tarefa 4
3. Evento editado numa aba enquanto o cron envia: salvar não dá conflito nem reverte o andamento. → Tarefa 4
4. Contato marcado "não perturbe", apagado ou sem telefone depois de agendado: não recebe. → Tarefa 4
5. Uma subconta com fila grande não atrasa e-mails, Social e automações das outras. → Tarefa 5

## File Structure

- Create `ui/event-message-parts.js`: partir a copy, achar marcadores, aplicar variáveis. Puro, usado por tela e servidor.
- Create `event-send-model.mjs`: coleções, agendar, cancelar, reenviar, reservar, resultado, limpeza.
- Create `event-sender.mjs`: executor (laço, espera, envio), com relógio e WhatsApp injetados.
- Create `ui/event-sends.js`: diálogos de grupos, ritmo e agendamento, e o bloco de andamento.
- Modify `whatsapp.mjs`, `server.mjs`, `model.mjs`, `event-planner-model.mjs`, `authorization.mjs`, `ui/agency-data.js`, `ui/event-planner.js`, `ui/event-planner.css`, `ui/app.js` (passar `load`).

---

### Task 1: Partes da mensagem

**Files:** Create `ui/event-message-parts.js`; Modify `server.mjs` (`staticFiles`); Test `test/event-message-parts.test.mjs`

**Interfaces — Produces:**
- `messageParts(notes: string) → Array<{ kind: 'text', text } | { kind: 'poll', question, options: string[] }>`
- `openMarkers(parts) → string[]` (sem repetição, ordem de aparição)
- `renderPart(part, contact | null) → part` com `{{contact.first_name}}` e `{{contact.name}}`; nome vazio remove o espaço e a vírgula que sobram (`Oi, {{contact.first_name}}!` → `Oi!`).
- `partsProblem(parts, channel) → string` ('' quando pode enviar): vazio, marcador, parte > 4.000, enquete fora de grupo, enquete com menos de 2 ou mais de 12 opções, variável de contato em grupo.

- [ ] **Step 1: Failing tests**

```js
test('Copy splits into messages and drops internal notes', () => {
  assert.deepEqual(messageParts('## Mensagem 1 · A\n\nOi\n\n## Mensagem 2\n\nTchau'), [{ kind: 'text', text: 'Oi' }, { kind: 'text', text: 'Tchau' }]);
  assert.deepEqual(messageParts('Sem título'), [{ kind: 'text', text: 'Sem título' }]);
  assert.deepEqual(messageParts('## Roteiro do áudio\nfala\n## Mensagem\nOi'), [{ kind: 'text', text: 'Oi' }]);
  assert.deepEqual(messageParts('Oi\n## Enquete · Vai?\n- Sim\n- Não\n\nResponde aí'), [{ kind: 'text', text: 'Oi' }, { kind: 'poll', question: 'Vai?', options: ['Sim', 'Não'] }, { kind: 'text', text: 'Responde aí' }]);
});
test('Open markers and limits block sending', () => {
  assert.deepEqual(openMarkers(messageParts('Veja [link do grupo] e [link do grupo]')), ['[link do grupo]']);
  assert.match(partsProblem(messageParts('Veja [x y]'), 'grupos'), /Preencha os marcadores: \[x y\]/);
  assert.match(partsProblem(messageParts('## Nota\ninterno'), 'grupos'), /não tem texto para enviar/);
  assert.match(partsProblem([{ kind: 'poll', question: 'a', options: ['1', '2'] }], 'privado'), /Enquete só pode ir para grupo/);
  assert.match(partsProblem(messageParts('Oi {{contact.name}}'), 'grupos'), /variáveis de contato/);
  assert.equal(partsProblem(messageParts('Oi {{contact.name}}'), 'privado'), '');
});
test('Contact variables never leave a hole', () => {
  const part = { kind: 'text', text: 'Oi, {{contact.first_name}}! Tudo bem?' };
  assert.equal(renderPart(part, { name: 'Ana Lima' }).text, 'Oi, Ana! Tudo bem?');
  assert.equal(renderPart(part, { name: '' }).text, 'Oi! Tudo bem?');
});
test('Every message of the launch template splits into something to send', () => {
  for (const m of messageTemplates('2026-12-10')) assert.ok(messageParts(m.notes).length, m.code);
});
```

- [ ] **Step 2: Run** `node --test test/event-message-parts.test.mjs` — FAIL (módulo inexistente).
- [ ] **Step 3: Implement** em `ui/event-message-parts.js`; registrar em `staticFiles`; `node scripts/sync-public.mjs`.
- [ ] **Step 4: Run** `node --test test/event-message-parts.test.mjs test/public-mirror.test.mjs` — PASS.
- [ ] **Step 5: Commit** `feat(eventos): parte a copy em mensagens enviáveis`

---

### Task 2: Grupos na conexão WhatsApp

**Files:** Modify `whatsapp.mjs`, `server.mjs` (rota); Test `test/evolution.test.mjs`

**Interfaces — Produces** (retornados por `createWhatsAppHandler`):
- `listWorkspaceGroups(agencyId, workspaceId, accountIsActive) → { groups: Array<{ jid, name, size }>, reason: '' | 'not-connected' | 'unsupported' | 'account-suspended' }`
- `sendEventMessage(agencyId, workspaceId, { to, part }, accountIsActive) → { outcome: 'sent' | 'waiting' | 'retry' | 'unconfirmed' | 'failed', id, error }`. `to` é JID `^[0-9-]+@g\.us$` ou telefone de 10 a 15 dígitos. `part` vem da Tarefa 1. Nunca lança.
- `GET /api/whatsapp/workspace/groups?workspace=…` → `{ groups, reason }`, exige `marketing` e `conversations` (não `settings`).

Regra de `outcome`: 2xx → `sent`; não conectado, suspenso ou "Connection Closed" → `waiting`; conexão recusada, DNS ou 503 → `retry`; timeout, abort, outros 5xx e 429 → `unconfirmed`; demais 4xx → `failed`. A chamada usa `retry: false`.

- [ ] **Step 1: Failing tests** (estender `fakeEvolution` com `/group/fetchAllGroups/<instância>` e `/message/sendPoll/<instância>`): lista devolve `{ jid, name, size }` ordenado por nome e usa `getParticipants=false`; desconectado → `reason: 'not-connected'` e lista vazia; texto para `120363000000000000@g.us` chega com `number` igual ao JID; enquete chega em `sendPoll` com `selectableCount: 1`; timeout → `unconfirmed` com **uma** chamada; 503 → `retry` com uma chamada; 400 de número inexistente → `failed`; `Connection Closed` → `waiting`; destino `abc@g.us` → `failed` sem chamar; rota sem `conversations` → 403.
- [ ] **Step 2: Run** `node --test test/evolution.test.mjs` — FAIL.
- [ ] **Step 3: Implement** reutilizando `workspaceSender`. Adapter Evolution ganha `groups({ creds, sub })` e aceita `retry` em `send` e `interactive` (padrão `true`, para não mudar quem já usa).
- [ ] **Step 4: Run** `node --test test/evolution.test.mjs` — PASS.
- [ ] **Step 5: Commit** `feat(whatsapp): lista grupos e envia para grupo sem repetir envio`

---

### Task 3: Agendar, cancelar e configurar

**Files:** Create `event-send-model.mjs`; Modify `model.mjs` (coleções, hidratação, roteamento `event-message-` e `event-send-`), `event-planner-model.mjs` (campos `groups`, `targets`), `authorization.mjs`, `ui/agency-data.js` (`eventSends: 'marketing'`, só leitura); Test `test/event-sends.test.mjs`

**Interfaces — Produces:**
- Linha: `{ id, eventId, itemId, batch, target: 'group'|'contact', to, contactId, name, part, parts, dueAt, status: 'queued'|'sending'|'sent'|'failed'|'canceled'|'skipped', attempts, notBefore, error, startedAt, sentAt, providerId, created }`
- `event.groups`, `event.deliveries[itemId] = { batch, state: 'scheduled'|'sending'|'done', total, sent, failed, skipped, canceled, late, dueAt, doneAt }`; item `targets: { tags: string[], excludeTags: string[] }`.
- `eventSendSettings = { minGapSeconds, maxGapSeconds, dailyCap, nextPrivateAt, nextGroupAt, day, sentToday }`
- Comandos: `event-send-settings` `{minGapSeconds,maxGapSeconds,dailyCap}`; `event-groups-save` `{ base, evento }` (id do evento); `event-message-preview` `{ itemId }` → `{ parts, recipients, sample, skipped: { dnd, noPhone, duplicate }, dueAt, endsAt, problem }`, sem gravar; `event-message-schedule` `{ itemId }` → `{ total }`; `event-message-cancel` `{ itemId }`; `event-message-retry` `{ itemId, include: 'failed' }`.
- Permissões: todos exigem `marketing` + `conversations`.

- [ ] **Step 1: Failing tests**: contatos por tags (qualquer das `tags`, nenhuma das `excludeTags`), sem `dnd`, sem telefone fora, telefone repetido uma vez (só dígitos); grupos vêm de `event.groups[item.audience]`; sem grupo, sem `audience`, sem tags, sem data/hora ou com marcador → erro em pt-BR e nenhuma linha; N destinos × M partes linhas, `dueAt` no fuso da subconta; agendar duas vezes → "já está agendada"; cancelar → só `queued` viram `canceled` e o item volta a `pronto`; agendar de novo depois de cancelar funciona com `batch` novo; `retry` recoloca só `failed`; duplicar evento zera `deliveries`, mantém `groups` e `targets`; mais de 1.000 contatos → erro; estado antigo hidrata com coleções vazias; limites de configuração; `save` em `eventSends` recusado; autorização de cada comando, e `event-send-take` recusado por `requireWorkspaceCommand`.
- [ ] **Step 2: Run** `node --test test/event-sends.test.mjs` — FAIL.
- [ ] **Step 3: Implement.** `event-groups-save` não mexe em `revision`. Grupo inválido (`jid` fora do padrão) → erro. `endsAt` usa a média dos intervalos e o teto diário.
- [ ] **Step 4: Run** `node --test test/event-sends.test.mjs test/event-planner.test.mjs` — PASS.
- [ ] **Step 5: Commit** `feat(eventos): agenda e cancela o envio das mensagens`

---

### Task 4: Reservar, gravar e proteger a fila

**Files:** Modify `event-send-model.mjs`, `event-planner-model.mjs` (`eventPlanFields`, `eventPlanAfterSave`), `model.mjs` (antes de apagar); Test `test/event-send-queue.test.mjs`

**Interfaces — Produces:**
- `event-send-take` `{ at }` → `{ row: { id, to, target, part }, contact, waitMs } | { row: null, waitMs }`; marca `sending`, reserva `nextPrivateAt`/`nextGroupAt`. `part` já renderizado.
- `event-send-result` `{ id, outcome, providerId, error, at }`.

Regras: ordem por `dueAt`, depois destino, depois `part`; parte N só depois da N−1 enviada ao mesmo destino; parte que falha cancela as seguintes do destino; grupo não espera pelo intervalo do privado. `sending` há mais de 5 min → `failed` "Envio não confirmado. Confira no WhatsApp antes de reenviar.". `retry` → `queued` com `notBefore` +1, +5, +15 min; depois da 3ª, `failed`. `waiting` → `queued` sem somar tentativa, `notBefore` +2 min. Texto lido do item no momento do envio; se a copy passou a ter problema (`partsProblem`) ou menos partes que o agendado, a linha vira `failed` com o motivo.

- [ ] **Step 1: Failing tests** com relógio injetado: cada item do Review Focus 1 a 4; intervalo do privado respeitado e teto diário vira no dia seguinte do fuso; grupo sai mesmo com privado em espera; partes em ordem; as quatro saídas de `outcome`; mudar data/hora do item move `dueAt` das `queued`; mudar texto vale para as que faltam; apagar item ou evento cancela as `queued`; salvar o plano com status antigo não desfaz `agendado`/`enviado` de item com fila; ao terminar, item `enviado` e `deliveries.state: 'done'` com contagens e `late` (> 1 h de atraso); limpeza mantém 5.000 linhas e nunca remove `queued`/`sending`; eventos `event_message_scheduled`, `event_message_sent` (uma vez por item), `event_message_failed`, `event_item_status_changed`; envio a contato cria mensagem `Outbound` canal `WhatsApp`, `origin: 'event'`, na conversa dele.
- [ ] **Step 2: Run** `node --test test/event-send-queue.test.mjs` — FAIL.
- [ ] **Step 3: Implement.** Status do item com `deliveries` ativa é derivado dela em `eventPlanFields`; o cron nunca altera `plan` nem `revision`.
- [ ] **Step 4: Run** `node --test test/event-send-queue.test.mjs test/event-sends.test.mjs test/event-planner*.test.mjs` — PASS.
- [ ] **Step 5: Commit** `feat(eventos): fila de envio com ritmo, teto e sem duplicar`

---

### Task 5: Executor no cron

**Files:** Create `event-sender.mjs`; Modify `server.mjs` (`runAllEventSends`, chamada ao lado de `runAllSocial` no timer local, em `/api/social/cron` e depois de agendar para agora); Test `test/event-sender.test.mjs`

**Interfaces — Produces:** `createEventSender({ change, send, now, sleep, budgetMs = 45_000 }) → { run(workspace) → number }`, um `run` por subconta por vez no processo.

- [ ] **Step 1: Failing tests** com relógio, `sleep` e WhatsApp falsos: envia até a fila esvaziar; para quando a próxima espera não cabe nos 45 s; `outcome: 'waiting'` encerra a rodada da subconta; dois `run` simultâneos não duplicam; sem linha vencida não grava nada no estado; um erro de gravação não deixa a subconta travada; subconta suspensa ou espaço pessoal não envia; **uma subconta esperando 45 s não atrasa `runAllSocial`** (as duas promessas correm juntas e a do Social termina primeiro).
- [ ] **Step 2: Run** `node --test test/event-sender.test.mjs` — FAIL.
- [ ] **Step 3: Implement**; `runAllEventSends` carrega só subcontas com linha `queued` vencida, concorrência 8; erros por subconta em `console.error`.
- [ ] **Step 4: Run** `node --test test/event-sender.test.mjs` e `npm test` — PASS.
- [ ] **Step 5: Commit** `feat(eventos): executor de envios fora da fila do cron`

---

### Task 6: Interface

**Files:** Create `ui/event-sends.js`; Modify `ui/event-planner.js`, `ui/event-planner.css`, `ui/app.js`, `server.mjs` (`staticFiles`); Test `test/event-sends-ui.test.mjs`

**Interfaces — Consumes:** comandos da Tarefa 3, `GET /api/whatsapp/workspace/groups`, `messageParts`/`partsProblem`. **Produces:** `deliveryView(c, event, item) → string`, `groupsDialogBody`, `settingsDialogBody`, `scheduleDialogBody(preview)`, `sendBanner(c, event) → string`.

- Comunicação ganha "Grupos do evento" (escolher grupos de cada destino) e "Ritmo de envio".
- Mensagem de grupo ou privado: "Agendar envio" abre a prévia com as partes exatamente como saem, o que fica de fora, total de destinos, ignorados por motivo, início e previsão de término. Se a hora já passou, o botão diz "Enviar agora". Confirmar agenda.
- Privado: no formulário, etiquetas que entram e que ficam de fora (as existentes nos contatos).
- Agendada: andamento "32 de 40 enviadas · 2 falhas · 1 com atraso", Cancelar, Reenviar falhas e lista das falhas com motivo.
- Faixa no topo: WhatsApp desconectado (link para `#settings/whatsapp`) ou fila acumulada com previsão de término.
- Com fila ativa, a tela atualiza o estado a cada 30 s enquanto visível e sem diálogo aberto.
- Integrações: cartão WhatsApp (agendadas, enviadas, falhas) e os quatro eventos novos na lista do guia de automações.
- Instagram e "outro" seguem assistidos, só com Copiar texto.

- [ ] **Step 1: Failing tests** das funções puras: cada texto acima; status "Agendado" ausente das opções manuais em grupos e privado e presente em e-mail; "Sem envio programado" em item antigo; nomes de grupo e de contato escapados; botão de agendar desabilitado com o motivo de `problem`; Integrações lista os quatro eventos novos e as contagens.
- [ ] **Step 2: Run** `node --test test/event-sends-ui.test.mjs` — FAIL.
- [ ] **Step 3: Implement**; `node scripts/sync-public.mjs`.
- [ ] **Step 4: Run** `node --test test/event-sends-ui.test.mjs test/event-planner-*.test.mjs` — PASS.
- [ ] **Step 5: Commit** `feat(eventos): agendamento e andamento dos envios na tela`

---

### Task 7: Verificação, revisão e PR

- [ ] **Step 1:** `npm test` (0 falhas) e `./node_modules/.bin/biome lint` nos arquivos tocados.
- [ ] **Step 2:** navegador, servidor local com Evolution falsa: escolher grupos, agendar grupo (3 partes) e privado (5 contatos, 1 `dnd`, 1 sem telefone), acompanhar, desconectar e reconectar, cancelar, reenviar falha. Temas claro e escuro, 375 px.
- [ ] **Step 3:** revisor independente na branch inteira, com o Review Focus; corrigir o que for importante com teste que falha antes.
- [ ] **Step 4:** **com o usuário**, número real e grupo de teste: confirmar que os participantes recebem o texto (a instância usa `groupsIgnore: true`, que pode atrapalhar o reenvio de chave a participantes de grupo). Se falhar, desligar `groupsIgnore`; os webhooks já ignoram grupos no servidor.
- [ ] **Step 5:** push e PR só com autorização do usuário. Nenhuma mensagem real sai sem o usuário agendar.
