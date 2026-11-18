# Fase 1 — Ciclo de vida das subcontas

**Status** — PARTIAL. Implementação e critérios de aceite verificados localmente. Homologação com Supabase e provedores sandbox pendente.

## Diagnóstico

- `canOpen()` validava o tenant e a atribuição, enquanto o status persistido em `agency.accounts` só afetava controles e indicadores de agência. Um operador conseguia ler e gravar em contas pausadas e encerradas.
- A API pública, o cron social, os webhooks e as rotas públicas transacionais entravam por caminhos próprios. Suspender uma subconta pelo painel não tirava essas operações de circulação.
- `account-meta` podia ser executado por `Agency User`. O comando não registrava o motivo, quando o status mudou ou a sequência de transições.
- A prévia de um formulário não publicado aceitava a presença de um cookie de sessão como autenticação. O caminho também precisava aplicar a política de subconta.

## Política aplicada

| Contexto | Active | Paused | Closed |
| --- | --- | --- | --- |
| Operação autenticada | Regras existentes de tenant, papéis e módulos | 403 `ACCOUNT_SUSPENDED` para operações e acesso de cliente | 403 `ACCOUNT_SUSPENDED` para operações e acesso de cliente |
| Suporte da agência | Acesso habitual | `Agency Owner` e `Agency Admin` podem consultar histórico e estado em modo somente leitura | Mesma consulta somente leitura e reativação autorizada |
| API v1 | Acesso conforme credencial e escopos | Listagem da própria agência preservada. Leituras e escritas de contatos bloqueadas | Mesmas regras de Paused |
| Site, formulário, curso público e mídia | Conteúdo disponível conforme publicação | Conteúdo publicado disponível. Envios de formulários e estatísticas suspensos | Página ou recurso indisponível com 404 |
| Portal do Cliente | Sessão, convites e vínculos de curso | Sessões existentes podem ler conteúdo concedido. Novas trocas de link bloqueadas e logout permitido | Conteúdo e troca de link indisponíveis. Logout permanece disponível |
| Links de rastreio | Redirecionamento e métricas, com workflow quando habilitado | Redirecionamento sem gravar clique ou executar workflow | Indisponível com 404 |
| Social e WhatsApp | Operação de acordo com as integrações | Agendamento, publicação, conexão por convite e envios bloqueados | Mesmas regras de Paused |

O motivo é exibido a usuários autenticados com acesso à subconta e a administradores. Respostas públicas e de integração omitem o motivo. Solicitantes de outro tenant recebem a negativa normal de autorização, sem dados do ciclo de vida.

## Implementação

- `server.mjs` resolve o status a partir da agência proprietária. Rotas autenticadas fazem a checagem após validar escopo. As rotas públicas partem do workspace persistido. Registros legados sem status partem de `Active`, e workspaces pessoais conservam as regras próprias.
- `agency-model.mjs` grava motivo, horários e até 100 transições por conta, além do registro na auditoria da agência. Apenas papéis com `who.settings` alteram o status. `account-reactivate` preserva os demais dados da conta. A leitura de suporte grava auditoria com o identificador da subconta.
- O bloqueio operacional cobre estado e ações do workspace, AI Studio, agentes de IA, Social Planner, WhatsApp, Portal e contatos da API v1. Também cobre transferência da prospecção, criação ou atualização de Setup a partir da conta suspensa e instalação de Setup ou template sobre ela. A aplicação em lote verifica os destinos antes da primeira gravação.
- O cron ignora contas suspensas antes de consultar feeds ou reivindicar posts. Se a suspensão ocorre durante uma publicação, o resultado já recebido é preservado, as redes restantes ficam registradas como bloqueadas e os posts ainda sem tentativa retornam a `scheduled`. A reativação permite que o próximo ciclo processe as pendências.
- Webhooks autenticados de UAZAPI e WAHA destinados a contas suspensas recebem HTTP 200 com `ignored: true` e código `ACCOUNT_SUSPENDED`. O suporte pode consultar contador e horário da última ocorrência por provedor. O conteúdo desses eventos é descartado, sem replay automático. O contador registra entregas descartadas, inclusive tentativas repetidas do provedor. Esse comportamento evita retry infinito sem mascarar a perda de eventos no período.
- `ui/app.js` mostra a tela de conta suspensa, orientação para suporte e troca de workspace. O modo de suporte exibe status, histórico e contadores. `ui/agency.js` mostra o status no painel e fornece controles de edição e reativação para administradores. Os dois arquivos foram sincronizados em `public/` para os caminhos de entrega existentes.

## Verificação

| Critério | Evidência local |
| --- | --- |
| Account User bloqueado em Paused e Account Admin bloqueado em Closed | `test/isolation.test.mjs` com sessão Supabase simulada e requisições HTTP reais ao servidor. |
| Suporte com auditoria e isolamento entre agências | O mesmo teste verifica leitura de dono e administrador de agência, bloqueio de operações de suporte, negativa sem exposição de status a outra agência e falta de permissão para `Agency User` reativar ou mudar status. |
| Publicações e filas | `test/social.test.mjs` passa pelo endpoint do cron. Verifica que o provedor não recebe novas chamadas em Paused ou Closed, que o envio em andamento preserva o resultado e que a fila volta após reativação. |
| Webhooks e saída WhatsApp | `test/whatsapp.test.mjs` e `test/waha.test.mjs` verificam resposta explícita, contador, estado do workspace preservado e ausência de nova chamada ao provedor. |
| Conteúdo público e preservação | `test/isolation.test.mjs` exercita site, formulário, curso, mídia, rastreio e Portal, verifica que a prévia rejeita cookie fabricado e usuário de outro tenant, compara snapshots do workspace antes e depois e confirma retomada de operações. |
| Compatibilidade de persistência e Setup | `test/platform.test.mjs` persiste transições pelo adaptador Supabase com Data API simulada. `test/agency.test.mjs` verifica que um lote com destino pausado é rejeitado antes de alterar o destino ativo. |
| Interface | No Chrome, com servidor em SQLite em memória, conferi o painel de subcontas, o modo de suporte, o histórico, a reativação pelo diálogo e a tela da conta pausada para o operador de teste. |

**Suíte final** — `npm.cmd test` com 80 testes aprovados, zero falhas e zero ignorados. Os arquivos da fase passaram por `node --check`, pela verificação de whitespace e pela comparação dos arquivos espelhados em `ui/` e `public/`.

## Arquivos e migrations

- Backend e modelos em `server.mjs`, `agency-model.mjs`, `model.mjs`, `whatsapp.mjs` e `waha.mjs`.
- Interface em `ui/app.js`, `ui/agency.js`, `public/app.js` e `public/agency.js`.
- Regressão em `test/isolation.test.mjs`, `test/agency.test.mjs`, `test/platform.test.mjs`, `test/social.test.mjs`, `test/whatsapp.test.mjs` e `test/waha.test.mjs`.
- Os campos são aditivos no JSON existente da agência. Zero migrations, deploys ou gravações em produção.

## Riscos, rollback e próxima fase

- A alteração de status e a operação do workspace residem em documentos separados. Existe uma janela para requisições já admitidas ou chamadas que o provedor já recebeu. O bloqueio de novas execuções usa os limites descritos acima. Validar latência, concorrência e sinais operacionais com Supabase e provedores sandbox antes da liberação.
- Homologar o histórico de migrações do projeto alvo, a política efetiva do banco, o cron e o comportamento dos webhooks com destinos de teste. URLs de mídia anteriormente servidas com cache podem permanecer em caches externos até o prazo original. As novas respostas usam `no-store`.
- Se uma liberação precisar ser revertida, pausar consumidores externos afetados antes de voltar ao artefato anterior, pois o código anterior não aplica o bloqueio por status. Os campos de auditoria e transições podem permanecer nos documentos. Recuperação de dados segue o procedimento em `00-baseline.md`.
- A Fase 2 usa este ciclo de vida como uma das entradas do motor central de autorização. As regras ainda pendentes incluem a projeção de leitura por módulo e a autorização de comandos especializados, como relatórios customizados.
