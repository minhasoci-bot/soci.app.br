# Fase 2 — Motor central de autorização

**Status** — PARTIAL. Motor aplicado às operações e projeções descritas abaixo, com validação HTTP local. Escopo por responsável, quotas, recursos comerciais e homologação continuam pendentes nas fases seguintes.

## Diagnóstico e correções

A Fase 0 reproduziu leitura de faturas por um usuário autorizado apenas para Contatos e criação de relatórios sem a permissão de Relatórios. A projeção anterior retirava somente agentes de IA do estado. As respostas de escrita também devolviam o estado integral.

O módulo `authorization.mjs` passou a concentrar as decisões por módulo, capacidade administrativa, plano estruturado, efeito relacionado e projeção de dados. O servidor cruza essas decisões com a identidade verificada, o pertencimento ao tenant e o ciclo de vida antes de executar a operação.

| Controle | Comportamento implementado |
| --- | --- |
| Identidade e tenant | Sessão validada pelo fluxo de autenticação existente. A agência deriva da sessão ou credencial de integração. O workspace precisa pertencer à agência e à lista de contas atribuídas ao usuário. |
| Permissões durante sessão ativa | Os dados da equipe são recarregados em cada requisição. Revogar o membro ou alterar sua lista de módulos afeta o acesso com o mesmo cookie. |
| Módulos e comandos | `requireWorkspaceCommand()` mapeia comandos e coleções permitidas. Comandos sem mapeamento são recusados. Relatórios customizados, mensagens de equipe, listas da caixa de entrada e novos comandos de Sites têm mapeamento explícito. |
| Leitura e respostas de escrita | `workspaceView()` projeta o estado e recalcula métricas com os dados autorizados. Campos de módulos bloqueados ficam vazios. Campos legados desconhecidos ficam fora da projeção restrita. |
| Dependências de interface | Usuários de conversas recebem o diretório de contatos necessário à operação, com nome, e-mail, telefone, empresa e tags. Outros módulos que referenciam contatos recebem ID e nome. Campos personalizados são filtrados pelo objeto relacionado. Essa política precisa ser reavaliada junto com o escopo por responsável na Fase 3. |
| Relatórios e exportação | Criar, alterar e excluir relatório customizado exige `reporting`. Snapshots de dashboard podem incluir métricas de vários módulos, então sua criação e leitura exigem o conjunto de módulos usado pela implementação atual. Exportações feitas a partir do estado recebido herdam a projeção do servidor. |
| Efeitos em registros relacionados | Excluir um contato exige acesso aos módulos dos registros que a operação removeria ou alteraria. A mesma verificação é feita antes de processar um lote. Também há controles para vínculos com workflows, arquivos usados em posts e campos personalizados em registros. |
| Agência | Configurações centrais e alteração de planos exigem capacidade administrativa. Administradores de agência não podem criar, promover, editar ou excluir um membro com papel de proprietário. O payload de agência de operadores omite equipe, chaves, auditoria e dados centrais sensíveis. Indicadores de workspaces usam a projeção permitida. |
| Setups | Extração, instalação e distribuição verificam os módulos dos ativos incluídos. Destinos em lote são validados antes de gravar o primeiro. |
| API pública e Private Integration | Preservados o hash da credencial, a agência emissora e os escopos. O acesso ao workspace também cruza os módulos estruturados do plano e o ciclo de vida. |
| Cron e webhooks | O runner social consulta status e módulo de Marketing antes de processar. Webhooks de mensagens verificam módulo de Conversas. Módulo indisponível retorna confirmação explícita com `MODULE_DISABLED`, sem alterar os registros operacionais. |
| OAuth social | O início guarda o ator. Callback e anexação de candidatos conferem o ator e suas permissões atuais. Uma autorização iniciada antes da revogação não permite concluir a conexão. Convites externos mantêm escopo próprio e validade. |
| Mídia | Um arquivo arbitrário do drive exige sessão autorizada com o módulo de Mídia. Imagens referenciadas por posts em publicação ou já publicados continuam públicas para os provedores, conforme a política de Marketing e status da conta. |
| Conteúdo e prévias | A política pública central considera status e módulo. Prévias de formulários, blogs, lojas, webinars e chats exigem identidade verificada e acesso ao workspace. Cookies fabricados ou sessões de outra agência são recusados. |
| Transações públicas | Formulários, checkout, inscrição em webinar e mensagens de chat são bloqueados durante suspensão. Contadores e presenças automáticas deixam de ser gravados quando a conta está pausada. Contas encerradas tornam o conteúdo indisponível. |

## Compatibilidade e decisões

O campo opcional `permissionMode` distingue quatro estados. Dados antigos sem esse campo conservam a interpretação da lista de permissões.

| Estado | Interpretação |
| --- | --- |
| Ausente, sem lista configurada | Acesso herdado aos módulos, conforme comportamento legado. |
| `inherit` | Todos os módulos, sujeitos ao tenant, status e plano. |
| `restricted` | Apenas módulos da lista. Lista vazia significa nenhum módulo. |
| `none` | Nenhum módulo, mesmo quando há uma lista salva. |

A edição de equipe permite selecionar o modo. O shell abre o primeiro módulo permitido e mostra um estado específico quando não há módulos disponíveis. O acesso a dados e comandos continua condicionado ao servidor.

Os planos antigos possuem texto livre em `features`. Esse texto conserva seu significado atual. Quando existe um array estruturado `plan.modules`, o motor calcula a interseção com os módulos do usuário. O editor comercial completo, as features específicas e quotas são entregas da Fase 4.

Durante esta execução, o repositório passou a integrar o Studio em Sites. O código atual normaliza permissões legadas `studio` para `sites`. As verificações de geração, edição e prévia acompanham essa associação.

O modelo JSONB e os adaptadores SQLite/Supabase permanecem em uso. Os campos novos são aditivos e não exigem migration nesta fase.

## Matriz de papéis

| Papel | Agência e configurações | Workspace |
| --- | --- | --- |
| Agency Owner | Administração da agência e dos proprietários | Todos os workspaces da própria agência, respeitando módulos, plano e ciclo de vida. |
| Agency Admin | Administração, com bloqueio de concessão ou alteração de proprietário | Todos os workspaces da própria agência, respeitando módulos, plano e ciclo de vida. |
| Agency User | Visão operacional da agência com projeção de dados e bloqueio de configurações centrais | Workspaces da própria agência, conforme módulos e plano. |
| Account Admin | Sem administração central | Workspaces atribuídos, conforme módulos e plano. Delegações da equipe local dependem da Fase 3. |
| Account User | Sem administração central | Workspaces atribuídos, conforme módulos e plano. Escopo somente de registros atribuídos depende da Fase 3. |

Suporte a contas pausadas e encerradas segue a política da Fase 1, com leitura restrita e auditoria para proprietários e administradores da agência.

## Validação e arquivos

Os testes HTTP de `test/isolation.test.mjs` exercitam duas agências, contas atribuídas, leitura e escrita, importação, lote, relatório, acesso a arquivos, token inválido e expirado, integração por escopo, plano estruturado e revogação com a sessão original. Os testes de Social e WhatsApp cobrem cron, callback OAuth e webhooks com módulo indisponível. Os testes existentes cobrem o adaptador Supabase com transporte simulado e o SQLite.

Na validação final em 18/11/2026, `npm.cmd test` aprovou **116 testes**, com zero falhas e zero ignorados. O teste acrescentado nesta continuação recusou prévias de blog, loja, webinar e chat com cookie fabricado ou sessão de outra agência. Também verificou bloqueio de novas transações nessas rotas em contas pausadas e encerradas, com comparação do estado persistido antes e depois.

No navegador, a edição de um usuário exibiu o modo restritivo e a sessão de teste com apenas Contatos abriu a tela correspondente com navegação limitada. A inspeção do estado sem nenhum módulo e a homologação com OAuth e banco reais continuam pendentes.

As principais alterações desta fase estão em `authorization.mjs`, `server.mjs`, `agency-model.mjs`, `whatsapp.mjs`, `waha.mjs`, nos shells `ui/app.js` e `ui/agency.js`, em suas cópias de entrega e nos testes de isolamento, Social e WhatsApp. Os novos handlers públicos de Sites foram incluídos na revisão conforme chegaram ao repositório.

## Limites, rollback e continuidade

- `onlyAssigned`, identidade imutável para responsáveis e delegações de Account Admin aguardam a Fase 3.
- Features específicas, limites concorrentes, orçamento de IA e ledger aguardam as Fases 4 e 5. A existência do motor não comprova esses controles.
- Workflows e agentes ainda exigem revisão de todas as ações e referências indiretas. Uma operação autorizada pode disparar workflows previamente publicados. A governança dessa execução deve usar as políticas do workspace e dos recursos envolvidos.
- A decisão e a gravação podem ocorrer em documentos separados. Atualizações de permissão afetam requisições seguintes. A atomicidade contra mudanças concorrentes entre essas etapas exige validação específica em homologação.
- O rollback deve usar um artefato compatível com os campos aditivos. Voltar ao código anterior reabre os desvios descritos no diagnóstico. A liberação deve seguir o roteiro de homologação e recuperação de `00-baseline.md`.

Zero migrations e zero alterações em produção nesta fase. A próxima entrega é a Fase 3, após a revisão dos critérios pendentes de autorização que forem necessários para seu escopo.
