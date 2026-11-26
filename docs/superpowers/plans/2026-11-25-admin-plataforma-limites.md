# Admin da plataforma (limites e alertas): plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** página "Plataforma" (só do dono) com plano, uso e limites de Supabase, Vercel, Cloudflare R2, Hostinger, Evolution e Twilio, conferida de hora em hora, com alertas por e-mail e push antes de estourar.

**Architecture:**
- Funções puras decidem limites, níveis, previsão e alertas (`platform-limits.mjs`).
- Coletores por serviço com `fetch` injetado (`platform-collectors.mjs`).
- Um monitor (`platform-monitor.mjs`) guarda tudo numa linha do store (`platform-usage`), roda de carona no cron de `/api/social/cron` e serve três endpoints em `routes/platform.mjs`.
- A interface é uma página da visão da agência (`ui/platform.js`), mostrada só quando `access.platform` é verdadeiro.

**Tech Stack:** Node ESM (`.mjs`), `node --test`, SQLite e Supabase (PostgREST + RPC), Resend, Web Push (`web-push.mjs`), HTML em template strings no `ui/`.

**Spec:** `docs/superpowers/specs/2026-11-25-admin-plataforma-limites-design.md`

## Global Constraints

- **Acesso:** só o dono da plataforma. Ele é a sessão com `session.id === agencyOwnerId` (`GO_AGENCY_OWNER_ID`) ou, sem login, `localAccess`. Qualquer outro recebe **404** nos endpoints e não vê o menu.
- **Níveis:**
  - `warn` ≥ 80%, `critical` ≥ 95%;
  - só volta a `ok` abaixo de 75%;
  - lembrete a cada 24 h enquanto `critical`.
- **Falhas de coleta:** a Evolution alerta após 2 falhas seguidas e os demais serviços após 3. `not-configured` nunca alerta.
- **Vencimento da Hostinger:** `warn` com ≤ 15 dias, `critical` com ≤ 3 dias.
- **Saldo do Twilio:** padrão de US$ 10, editável na página.
- **Conferência automática:** quando a última tiver ≥ 55 min. "Conferir agora" pode rodar no máximo a cada 2 min.
- **Coleta:** tempo máximo de 8 s por serviço, todos em paralelo.
- **Histórico:**
  - pontos de hora em hora por 7 dias (168 por métrica);
  - máximo diário por 90 dias;
  - as previsões usam só os pontos dos últimos 7 dias.
- **Gravar antes de enviar:** o estado do alerta é gravado antes do envio. Se a gravação falhar, nada é enviado.
- **Segredos:** tokens nunca vão para o store, para o navegador nem para log. Erro de API vira texto curto (`HTTP 401`, `tempo esgotado`), sem URL nem cabeçalho.
- **Variáveis novas:** `VERCEL_API_TOKEN`, `VERCEL_TEAM_ID`, `CLOUDFLARE_API_TOKEN`, `HOSTINGER_API_TOKEN`.
- **Variáveis reaproveitadas:** `R2_ACCOUNT_ID`, `EVOLUTION_BASE_URL`, `EVOLUTION_API_KEY`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `RESEND_API_KEY`, `PORTAL_EMAIL_FROM`.
- **Supabase:** sem token novo, por RPC `go_platform_usage()`.
- **Interface:**
  - Liquid Glass, com tokens só de `ui/tokens.css`;
  - sem `confirm`, `alert` ou `prompt` (usar `ui/ask.js`);
  - texto em português do Brasil;
  - em coluna única abaixo de 720 px.
- **Documentação:** só interna, em `docs/plataforma-limites.md`, sem artigo em `docs-site/`.
- **Testes:** `npm test`. Para rodar um arquivo: `node --test --test-isolation=none test/<arquivo>.test.mjs`.

## Review Focus

1. **Serviço lento ou fora do ar durante o cron.** As publicações do `/api/social/cron` saem iguais, e só o cartão daquele serviço mostra erro. O teste fica na Task 4: coletor que nunca responde, e `runIfDue` termina em menos de 9 s com os outros serviços `ok`.
2. **Métrica oscilando entre 79% e 81% toda hora.** Só um e-mail sai. O teste fica na Task 1: sequência 79 → 81 → 79 → 81 gera um único alerta.
3. **Duas chamadas de cron ao mesmo tempo.** Só uma roda a conferência. O teste fica na Task 4: dois `runIfDue` simultâneos, e os coletores são chamados uma vez só.
4. **Dono sem e-mail de alerta e sem push.** A conferência roda e grava, não lança erro, e a página avisa "Nenhum canal de alerta ativo". O teste fica na Task 4.
5. **Sessão de outra agência chama os endpoints.** Recebe 404 sem corpo revelador, e o `/api/agency` dela não traz `platform`. O teste fica na Task 5.

---

### Task 1: Limites, níveis, previsão e decisão de alertas (puro)

**Files:**
- Create: `platform-limits.mjs`
- Test: `test/platform-limits.test.mjs`

**Interfaces:**
- Produces:
  - `PLAN_LIMITS`: objeto `{ supabase: { free: { db: 524288000, storage: 1073741824, mau: 50000 }, pro: { db: 8589934592, storage: 107374182400, mau: 100000 } }, vercel: { hobby: { deploys24h: 100 }, pro: { deploys24h: 6000 } }, cloudflare: { free: { r2Storage: 10737418240, r2ClassA: 1000000, r2ClassB: 10000000 } } }`
  - `levelOf(metric: Metric, previous: Level = 'ok'): Level`. `Level` é `'ok' | 'warn' | 'critical'`. `Metric` é `{ key, label, used: number|null, limit: number|null, unit: 'bytes'|'count'|'percent'|'usd'|'days', cycle: 'total'|'month'|'day24h'|'now', kind?: 'usage'|'floor'|'deadline' }`. `used` ou `limit` nulos dão `'ok'`. As regras de cada `kind`:
    - `usage` (padrão): percentual com histerese 80/95/75;
    - `floor`: `warn` se `used < limit` e `critical` se `used < limit / 2`;
    - `deadline`: `used` são dias, com `warn` em ≤ 15 e `critical` em ≤ 3.
  - `projectFull(points: [number, number][], metric: Metric, now: number): string|null|'safe'`:
    - `points` são pares `[timestamp ms, used]`, e a função usa só os dos últimos 7 dias;
    - devolve `'YYYY-MM-DD'` da data em que atinge `limit` por regressão linear;
    - `cycle: 'month'` considera só os pontos do mês corrente e devolve `'safe'` se não estoura antes do fim do mês;
    - `cycle: 'total'` devolve a data se for em até 90 dias, senão `'safe'`;
    - devolve `null` com menos de 3 pontos ou para `day24h` e `now`.
  - `decideAlerts(previous: AlertState, readings: ServiceReading[], now: number): { next: AlertState, alerts: Alert[] }`:
    - `AlertState` é `{ metrics: { [`${service}.${key}`]: { level: Level, sentAt: number } }, failures: { [service]: number } }`;
    - `Alert` é `{ service, key, level: 'warn'|'critical'|'failure', title: string, body: string }`;
    - `ServiceReading` é definido na Task 2.

- [ ] **Step 1: Escrever os testes que falham.** Use `const m = (used, extra = {}) => ({ key: 'db', label: 'Banco', used, limit: 100, unit: 'count', cycle: 'total', ...extra })`.
  - `levelOf`:
    - `levelOf(m(79))` → `'ok'`, `m(80)` → `'warn'`, `m(95)` → `'critical'`;
    - `levelOf(m(77), 'warn')` → `'warn'`, `levelOf(m(74), 'warn')` → `'ok'`;
    - `levelOf(m(9, { kind: 'floor', limit: 10 }))` → `'warn'`, `m(4, { kind: 'floor', limit: 10 })` → `'critical'`;
    - `levelOf(m(15, { kind: 'deadline' }))` → `'warn'`, `m(3, { kind: 'deadline' })` → `'critical'`, `m(30, { kind: 'deadline' })` → `'ok'`;
    - `levelOf(m(null))` → `'ok'`.
  - `projectFull`:
    - com pontos de 50 → 56 em 6 dias (1 por dia) e `cycle: 'total'`, devolve a data 50 − 6 = 44 dias depois do último ponto, em `YYYY-MM-DD`;
    - pontos constantes devolvem `'safe'`;
    - 2 pontos devolvem `null`;
    - `cycle: 'month'` com uso de 10 por dia e 90 usados no dia 28 devolve uma data do mês corrente;
    - `cycle: 'month'` com uso de 1 por dia e 50 usados no dia 1 devolve `'safe'`.
  - `decideAlerts` (com `S = used => [{ service: 'supabase', status: 'ok', plan: 'free', link: '', metrics: [m(used)] }]`):
    - a sequência 79 → 81 → 79 → 81 (uma hora entre chamadas, encadeando `next`) gera exatamente 1 alerta `warn` no total. **(Review Focus 2)**
    - 81 → 96 gera 1 alerta `critical`;
    - `critical` repetido 23 h depois não gera alerta, e 24 h depois gera 1 lembrete `critical`;
    - 3 leituras `{ service: 'vercel', status: 'error', error: 'HTTP 401', metrics: [] }` geram 1 alerta `failure` na 3ª, e a 4ª não gera nada;
    - para `evolution`, a 2ª falha já gera o alerta;
    - depois de uma leitura `ok`, `failures.vercel` volta a 0;
    - `status: 'not-configured'` nunca gera alerta.

- [ ] **Step 2: Rodar e ver falhar.**
  Run: `node --test --test-isolation=none test/platform-limits.test.mjs`
  Expected: FAIL (`Cannot find module '../platform-limits.mjs'`).

- [ ] **Step 3: Implementar `platform-limits.mjs`** com as assinaturas acima.
  - Nas regressões, o tempo entra em dias.
  - O texto do alerta segue o padrão: título `"Supabase: Banco em 82%"` e corpo `"412 MB de 500 MB. No ritmo atual, enche em 12/12. Abra: /app#agency/plataforma"`.
  - Para `failure`, o título é `"Vercel: não consegui ler os dados"`, e o corpo traz o `error`.

- [ ] **Step 4: Rodar e ver passar.** Mesmo comando. Expected: PASS.

- [ ] **Step 5: Commit.** `git add platform-limits.mjs test/platform-limits.test.mjs && git commit -m "feat(plataforma): limites, níveis, previsão e decisão de alertas"`

### Task 2: Coletores dos serviços

**Files:**
- Create: `platform-collectors.mjs`
- Test: `test/platform-collectors.test.mjs`

**Interfaces:**
- Consumes: `PLAN_LIMITS` (Task 1); `store.platformUsage()` (Task 3; nos testes, um objeto falso).
- Produces:
  - `ServiceReading = { service: 'supabase'|'vercel'|'cloudflare'|'hostinger'|'evolution'|'twilio', name: string, status: 'ok'|'not-configured'|'error', plan: string, link: string, metrics: Metric[], error?: string }`.
  - `collectAll({ env, request, store, settings, now }): Promise<ServiceReading[]>`, sempre com os 6 serviços na ordem acima. `settings` é `{ plans: { supabase?: 'free'|'pro', vercel?: 'hobby'|'pro' }, twilioMinUsd: number }`.
  - Cada coletor tem a forma `collectX({ env, request, store, settings, now }) => Promise<ServiceReading>` e é exportado para os testes.
  - Os tempos máximos usam `AbortSignal.timeout(8000)`.
  - `link` é o painel do serviço:
    - `https://supabase.com/dashboard/project/zlkhoucdqfxgiorujifj/settings/billing/usage`
    - `https://vercel.com/<team>/~/usage`
    - `https://dash.cloudflare.com/<account>/r2/overview`
    - `https://hpanel.hostinger.com/vps`
    - `https://console.twilio.com/us1/billing/manage-billing/billing-overview`
    - para a Evolution, o próprio `EVOLUTION_BASE_URL`.

Fontes por coletor (quem implementar confirma os formatos atuais; Hostinger: as ferramentas `search` do MCP da Hostinger nesta sessão mostram os schemas; o que a API não der vira `used: null` e `note: 'a API não informa'`):

| Coletor | Sem configuração quando falta | Chamada | Métricas |
|---|---|---|---|
| supabase | `store.platformUsage` ausente | `await store.platformUsage()` → `{ db_bytes, storage_bytes, mau }` | `db` (bytes, total), `storage` (bytes, total), `mau` (count, month), mais `egress` com `used: null`, `note: 'a API não informa'`. Plano: `settings.plans.supabase \|\| 'free'` |
| vercel | `VERCEL_API_TOKEN` ou `VERCEL_TEAM_ID` | `GET https://api.vercel.com/v2/teams/{team}` (`billing.plan`); `GET https://api.vercel.com/v6/deployments?teamId={team}&since={now-24h}&limit=100`, paginando por `pagination.next` | `deploys24h` (count, day24h). Plano: `billing.plan`, senão `settings.plans.vercel \|\| 'hobby'` |
| cloudflare | `CLOUDFLARE_API_TOKEN` ou `R2_ACCOUNT_ID` | `POST https://api.cloudflare.com/client/v4/graphql`: `r2StorageAdaptiveGroups` (max `payloadSize` + `metadataSize`, último dia) e `r2OperationsAdaptiveGroups` (soma de `requests` por `actionType`, do 1º dia do mês até agora) | `r2Storage` (bytes, total), `r2ClassA` e `r2ClassB` (count, month). Classe B: `HeadBucket, HeadObject, GetObject, UsageSummary, GetBucketEncryption, GetBucketLocation, GetBucketCors, GetBucketLifecycleConfiguration`. Grátis (não contam): `DeleteObject, DeleteBucket, AbortMultipartUpload`. O resto é classe A |
| hostinger | `HOSTINGER_API_TOKEN` | `GET https://developers.hostinger.com/api/vps/v1/virtual-machines` (a VM cujo hostname ou IP bate com o host de `EVOLUTION_BASE_URL`; senão a primeira); `.../virtual-machines/{id}/metrics` (últimas 6 h); `GET .../api/billing/v1/subscriptions` | `disk`, `ram` e `cpu` (percent, now, `limit: 100`); `expires` (days, now, `kind: 'deadline'`, `limit: 0`). Plano: o da VM |
| evolution | `EVOLUTION_BASE_URL` ou `EVOLUTION_API_KEY` | `GET {base}/instance/fetchInstances`, header `apikey` | `instances` (count, now, `limit: null`). Resposta diferente de 2xx ou tempo esgotado dá `status: 'error'` |
| twilio | `TWILIO_ACCOUNT_SID` ou `TWILIO_AUTH_TOKEN` | `GET https://api.twilio.com/2010-04-01/Accounts/{sid}/Balance.json` (Basic) | `balance` (usd, now, `kind: 'floor'`, `limit: settings.twilioMinUsd`) |

- [ ] **Step 1: Escrever os testes que falham**, com `request` falso que registra as URLs e responde `Response.json(...)`.
  - Cada coletor sem a variável devolve `status: 'not-configured'` e não chama `request`.
  - Supabase com `{ db_bytes: 412*1048576, storage_bytes: 0, mau: 214 }` dá a métrica `db` com `limit: 524288000`.
  - Vercel com 2 páginas de 60 deploys dá `deploys24h.used === 120`, e o plano `'hobby'` sai de `billing.plan`.
  - Cloudflare com `[{ dimensions: { actionType: 'PutObject' }, sum: { requests: 10 } }, { dimensions: { actionType: 'GetObject' }, sum: { requests: 7 } }, { dimensions: { actionType: 'DeleteObject' }, sum: { requests: 99 } }]` dá classe A 10 e classe B 7.
  - Twilio `{ balance: '7.50', currency: 'USD' }` dá `balance.used === 7.5`.
  - Resposta 401 dá `status: 'error'`, `error: 'HTTP 401'`, e o texto não contém o token nem a URL.
  - `collectAll` com um coletor cujo `request` nunca resolve termina em menos de 9 s, com esse serviço em `status: 'error'`, `error: 'tempo esgotado'`, e os outros `ok`. **(Review Focus 1)** Para o teste, aceite `timeoutMs` opcional em `collectAll` (padrão 8000) e use 50 ms.

- [ ] **Step 2: Rodar e ver falhar.** `node --test --test-isolation=none test/platform-collectors.test.mjs` → FAIL.
- [ ] **Step 3: Implementar `platform-collectors.mjs`.** Use `Promise.allSettled`, e uma rejeição vira `status: 'error'`.
- [ ] **Step 4: Rodar e ver passar.** PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(plataforma): coletores de Supabase, Vercel, Cloudflare, Hostinger, Evolution e Twilio"`

### Task 3: Uso do Supabase por RPC e linha `platform-usage` no store

**Files:**
- Create: `supabase/migrations/20261125120000_go_platform_usage.sql`
- Modify: `supabase/provision-storage.sql` (acrescentar o bloco no fim)
- Modify: `storage.mjs` (incluir `platform` no regex de `isDocument`; método `platformUsage` nos dois stores)
- Test: `test/storage.test.mjs` (acrescentar casos; se não existir, criar `test/platform-storage.test.mjs`)

**Interfaces:**
- Produces:
  - `store.platformUsage(): Promise<{ db_bytes: number, storage_bytes: number, mau: number|null }>`:
    - no SQLite devolve `{ db_bytes: page_count * page_size, storage_bytes: 0, mau: null }`;
    - no Supabase faz `POST rpc/go_platform_usage` com `{}`.
  - `isDocument('platform-usage') === true`.
- SQL: `public.go_platform_usage() returns jsonb`, `language sql`, `security definer`, `set search_path = ''`.
  - Devolve `jsonb_build_object('db_bytes', pg_database_size(current_database()), 'storage_bytes', coalesce((select sum((metadata->>'size')::bigint) from storage.objects), 0), 'mau', (select count(*) from auth.users where last_sign_in_at >= date_trunc('month', now())))`.
  - Só responde se `encode(sha256(convert_to(coalesce(nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-go-storage-key', ''), 'UTF8')), 'hex') = 'GO_STORAGE_KEY_SHA256'`. Senão lança `raise exception 'not allowed'` (escreva como `plpgsql` se precisar do `if`).
  - `revoke all ... from public, anon, authenticated; grant execute ... to anon;`
  - O mesmo bloco vai no fim de `provision-storage.sql`, que já tem o placeholder `GO_STORAGE_KEY_SHA256`.

- [ ] **Step 1: Testes que falham.**
  - `isDocument('platform-usage')` é verdadeiro.
  - `createSqliteStore(':memory:').platformUsage()` devolve `db_bytes > 0`, `storage_bytes === 0`, `mau === null`.
  - Supabase store com `request` falso: chama `/rest/v1/rpc/go_platform_usage` com `POST` e o header `X-Go-Storage-Key`, e devolve o JSON.
- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar** a migration, o bloco no provision e os métodos no `storage.mjs` (no Supabase, pelo `api(...)` existente).
- [ ] **Step 4: Rodar e ver passar**, com `npm test -- --test-name-pattern=platform` ou o arquivo de teste.
- [ ] **Step 5: Commit.** `git commit -m "feat(plataforma): função go_platform_usage e linha platform-usage no store"`

### Task 4: Monitor (estado, histórico, alertas, carona no cron)

**Files:**
- Create: `platform-monitor.mjs`
- Modify: `routes/social.mjs` (no handler de `/api/social/cron`, depois de `runAllSocial`: `await deps.platformMonitor?.runIfDue().catch(e => console.error(\`Plataforma: ${e.message}\`))`, com a resposta `{ published }` inalterada)
- Test: `test/platform-monitor.test.mjs`

**Interfaces:**
- Consumes: `collectAll` (Task 2); `levelOf`, `projectFull` e `decideAlerts` (Task 1); `store.load`, `store.insert` e `store.change` (Task 3, linha `platform-usage`); `sendPush(subscription, message, { env, request })` e `pushSubscription(value)` de `web-push.mjs`; `documentMailer().email(to, { subject, text }, idempotency)` de `document-mail.mjs`.
- Produces `createPlatformMonitor({ store, env, request, mailer, now = Date.now, collect = collectAll })` com:
  - `runIfDue(): Promise<boolean>`: reivindica a vez num `store.change` (se `lastRunAt > now() - 55 min`, devolve `false`; senão grava `lastRunAt = now()` na mesma mudança) e chama `check()`. **(Review Focus 3)**
  - `check({ manual = false } = {}): Promise<View>`:
    - `manual` respeita o intervalo mínimo de 2 min (`lastManualAt`) e lança `error` 429 com `'Aguarde 2 minutos entre conferências.'`;
    - coleta, anexa o histórico (hourly ≤ 168 pontos por métrica e daily ≤ 90 entradas `[YYYY-MM-DD, max]`), roda `decideAlerts` e **grava `next` e as leituras num só `store.change` antes de enviar**;
    - depois envia cada alerta por e-mail (se `settings.alertEmail`) e por push (para cada `settings.push[]`);
    - falha de envio é só registrada em `lastSendErrors`.
  - `view(): Promise<View>`, onde `View = { checkedAt: number|null, services: (ServiceReading & { metrics: (Metric & { pct: number|null, level: Level, projection: string|null })[] })[], settings: { alertEmail: string, twilioMinUsd: number, plans: object, pushDevices: number }, channels: { email: boolean, push: boolean }, unmonitored: { name: string, url: string }[] }`. `unmonitored` é OpenAI, Resend, Meta, AbacatePay e Google, com a URL do painel de cada um.
  - `saveSettings({ alertEmail?, twilioMinUsd?, plans? }): Promise<View>`, com validação:
    - e-mail com regex simples, até 200 caracteres;
    - `twilioMinUsd` entre 0 e 10000;
    - planos apenas entre as chaves de `PLAN_LIMITS`.
  - `subscribe(sub): Promise<View>`: valida com `pushSubscription`, sem repetir `endpoint` e com no máximo 10 aparelhos.
  - `ensureEmail(email)`: grava `alertEmail` só se estiver vazio.
- Linha no store: id `platform-usage`, criada sob demanda como `socialRow` faz (`{ profile: { name: 'Plataforma' }, readings: [], history: {}, alerts: { metrics: {}, failures: {} }, settings: { alertEmail: '', twilioMinUsd: 10, plans: {}, push: [] }, lastRunAt: 0, lastManualAt: 0 }`).

- [ ] **Step 1: Testes que falham**, com store SQLite `:memory:`, `collect` falso, `mailer` falso (registra chamadas) e relógio controlado.
  - `runIfDue` 2 vezes seguidas: `collect` é chamado 1 vez. Avançando 55 min, chama de novo.
  - `Promise.all([runIfDue(), runIfDue()])`: `collect` é chamado 1 vez. **(Review Focus 3)**
  - Leitura com `db` em 82% e `alertEmail` definido: `mailer.email` é chamado 1 vez, com o assunto contendo `'82%'`. A mesma leitura 1 h depois não envia de novo.
  - Gravar antes de enviar: com um store cujo `change` lança erro na gravação das leituras, `check()` rejeita e `mailer.email` não é chamado.
  - Sem e-mail e sem push: `check()` resolve, `view().channels` é `{ email: false, push: false }` e as leituras ficam gravadas. **(Review Focus 4)**
  - Histórico: 200 conferências de hora em hora deixam no máximo 168 pontos hourly por métrica.
  - `check({ manual: true })` 2 vezes em 1 min: a 2ª rejeita com status 429.
  - `saveSettings({ alertEmail: 'x' })` rejeita com status 400.
  - Cron: com `routes/social.mjs` e um `platformMonitor` cujo `runIfDue` lança erro, `/api/social/cron` ainda responde 200 com `published`. Teste no estilo dos testes do cron existentes (procure por `/api/social/cron` em `test/`).
- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar `platform-monitor.mjs`** e a linha no `routes/social.mjs`.
- [ ] **Step 4: Rodar e ver passar.**
- [ ] **Step 5: Commit.** `git commit -m "feat(plataforma): monitor de hora em hora com histórico e alertas"`

### Task 5: Endpoints, permissão do dono e ligação no server

**Files:**
- Create: `routes/platform.mjs`
- Modify: `server.mjs`:
  - criar o monitor em `makeServer` (novo parâmetro `platformRequest = fetch`, `platformEnv = process.env`, `mailer: documentMail`);
  - passar `platformMonitor` a `createSocialRoutes`;
  - registrar `platformRoute` antes de `actionRoute`;
  - em `accessContext`, incluir `platform: Boolean(localAccess && !session || session && agencyOwnerId && session.id === agencyOwnerId)` no `who` do dono (o mesmo objeto vira `access` em `/api/agency`).
- Test: `test/platform-routes.test.mjs` (reaproveitar o `start(t)` de `test/isolation.test.mjs` como modelo: auth falso, `agencyOwnerId: ownerA.id`)

**Interfaces:**
- Consumes: `createPlatformMonitor` (Task 4).
- Produces: `createPlatformRoutes({ monitor, verifiedUser, agencyOwnerId, localAccess, error, payload })`, que devolve `async ({ req, res, p, method, json }) => result | NEXT_ROUTE`. As rotas:
  - `GET /api/platform/usage` → `json(await monitor.view())`. Antes, `monitor.ensureEmail(session.email)`.
  - `POST /api/platform/check` → `json(await monitor.check({ manual: true }))`.
  - `POST /api/platform/settings` → `json(await monitor.saveSettings(body))`.
  - `POST /api/platform/push` → `json(await monitor.subscribe(body.subscription))`.
  - Quem não é dono recebe `error('Not found.', 404)` em todas.

- [ ] **Step 1: Testes que falham.**
  - `ownerA` faz `GET /api/platform/usage` e recebe 200 com `services.length === 6`. Os serviços sem variável vêm `not-configured`, porque o teste passa `platformEnv: {}`.
  - `ownerB` e `member` recebem 404 nas 4 rotas, e o corpo não contém `platform`. **(Review Focus 5)**
  - `GET /api/agency` traz `access.platform === true` para `ownerA` e falso ou ausente para `ownerB`.
  - Sem login (`auth` ausente), a resposta é 401 ou 404, nunca 200.
- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar** a rota e a ligação no `server.mjs`.
- [ ] **Step 4: `npm test`** completo passa.
- [ ] **Step 5: Commit.** `git commit -m "feat(plataforma): endpoints do admin restritos ao dono"`

### Task 6: Página "Plataforma" e faixa no painel da agência

**Files:**
- Create: `ui/platform.js` (puro, sem DOM no import)
- Modify: `ui/agency.js`:
  - item de menu `['plataforma', 'Plataforma', 'gauge']` no grupo "Visão geral", só se `A.data.access.platform`;
  - `pages.plataforma`;
  - carga de `/api/platform/usage` no `show`;
  - ações `data-ag` para conferir, salvar configurações e ativar push;
  - faixa em `pages.dashboard`.
  - Não altere a ordem de `agencyNav` (os `slice` dependem dela): insira o item no `shell`.
- Modify: `ui/agency.css` (estilos `.pf-*`, só com tokens de `ui/tokens.css`)
- Test: `test/platform-ui.test.mjs`

**Interfaces:**
- Consumes: `View` (Task 4).
- Produces:
  - `platformPage(view: View, { h, tr }): string`;
  - `platformBanner(view: View, { h, tr }): string`, que devolve `''` se nenhuma métrica está em `warn` ou `critical`;
  - `formatAmount(value, unit): string`, com bytes em MB/GB com 1 casa e vírgula, `usd` como `US$ 7,50`, `count` com separador de milhar e `days` como `12 dias`.

Layout (do design):

```
Plataforma                                   Última conferência: 14:02  [Conferir agora]
[faixa: N limites perto de estourar · lista curta]
[aviso "Nenhum canal de alerta ativo" quando channels.email e channels.push forem falsos]
grade de cartões: nome · plano · ↗ painel / linhas: rótulo, barra (data-w), "usado / limite", %, previsão
cartão not-configured: "Não conectado", qual variável criar, link para docs internas
cartão error: "Não consegui ler os dados: <error>"
linha "Sem acompanhamento automático: OpenAI ↗ · Resend ↗ · ..."
Configurações: e-mail de alerta, saldo mínimo Twilio, plano Supabase (Free/Pro), plano Vercel (Hobby/Pro), [Ativar notificações neste aparelho]
```

Previsão: `'safe'` vira "não estoura neste ciclo", uma data vira "no ritmo atual: cheio em DD/MM" e `null` não mostra nada.

- [ ] **Step 1: Testes que falham** (strings).
  - `platformPage` com uma métrica em 82% contém `82%`, `class="pf-level warn"` e `no ritmo atual: cheio em`.
  - Um serviço `not-configured` da Vercel contém `VERCEL_API_TOKEN`.
  - `channels` falsos mostram `Nenhum canal de alerta ativo`.
  - Tudo que vem do servidor passa por `h()`: um `error` com `<script>` sai escapado.
  - `platformBanner` com tudo `ok` devolve `''`.
  - `formatAmount(432013312, 'bytes')` dá `'412,0 MB'` e `formatAmount(7.5, 'usd')` dá `'US$ 7,50'`.
- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar** `ui/platform.js` e a integração no `agency.js`:
  - push pela mesma chave de `/api/push/key` e `navigator.serviceWorker`, como já faz o fluxo de notificações do app (procure `push/subscribe` em `ui/`);
  - mensagens com `tell`/`ask` de `ui/ask.js`;
  - CSS em `ui/agency.css`.
- [ ] **Step 4: Rodar e ver passar.** Depois `npm test` completo.
- [ ] **Step 5: Verificar no navegador.** Suba o dev server local com login desligado (`GO_DEV_NO_AUTH=1`, ver `.claude/launch.json` ou criar) e abra `/app#agency/plataforma`. Confira:
  - 6 cartões, com os sem variável em "Não conectado";
  - "Conferir agora" atualiza o horário;
  - em 375 px, uma coluna sem rolagem horizontal;
  - console sem erros.
  - Tire um screenshot para o PR.
- [ ] **Step 6: Commit.** `git commit -m "feat(plataforma): página Plataforma e faixa de alerta no painel da agência"`

### Task 7: Documentação interna

**Files:**
- Create: `docs/plataforma-limites.md`

- [ ] **Step 1: Escrever:**
  - o que a página mostra e quem vê;
  - como os alertas funcionam (80/95/75, lembrete de 24 h, falhas 3 e 2, vencimento 15 e 3 dias);
  - cada variável nova, com onde criar e quais permissões mínimas, só leitura:
    - Vercel: token com escopo no time `soci3`;
    - Cloudflare: token com "Account Analytics: Read" e "R2: Read";
    - Hostinger: token de API do hPanel;
  - o passo do SQL Editor: rodar o bloco de `go_platform_usage` do `provision-storage.sql` com o hash trocado;
  - o ponto cego aceito (Supabase e Vercel fora do ar).
- [ ] **Step 2: Conferir.** Todo nome de variável e caminho citado existe no código (`grep`).
- [ ] **Step 3: Commit.** `git commit -m "docs(plataforma): guia interno da página Plataforma e dos tokens"`
