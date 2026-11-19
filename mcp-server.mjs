// Model Context Protocol (MCP) Server for Soci platform.
// Exposes tools and resources for Anthropic Claude, Claude Code, OpenAI ChatGPT and external AI agents.
// Specification: JSON-RPC 2.0 / MCP Protocol (2024-11-05).

export function createMcpHandler({ store, change, accountIsActive }) {
  function listTools() {
    return [
      {
        name: 'list_social_accounts',
        description: 'Lista as redes sociais conectadas na subconta da Soci (Instagram, Facebook, LinkedIn, TikTok, YouTube, Bluesky, Threads, etc.) e seu status de conexão.',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      },
      {
        name: 'list_scheduled_posts',
        description: 'Lista as publicações agendadas, rascunhos, em revisão ou publicadas no Social Planner da Soci.',
        inputSchema: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              description: 'Filtrar por status: all, scheduled, in_review, draft, published, failed',
              enum: ['all', 'scheduled', 'in_review', 'draft', 'published', 'failed']
            },
            limit: {
              type: 'number',
              description: 'Quantidade máxima de posts para retornar (padrão 20, máx 50)'
            }
          }
        }
      },
      {
        name: 'create_social_post',
        description: 'Cria ou agenda uma nova publicação no Social Planner da Soci.',
        inputSchema: {
          type: 'object',
          required: ['summary', 'accountIds'],
          properties: {
            summary: {
              type: 'string',
              description: 'Texto principal da publicação'
            },
            accountIds: {
              type: 'array',
              items: { type: 'string' },
              description: 'IDs das contas sociais onde publicar (obtidas via list_social_accounts)'
            },
            scheduleDate: {
              type: 'string',
              description: 'Data e hora no formato ISO (ex: 2026-11-25T14:00:00Z). Se omitido e mode for "draft", salva como rascunho.'
            },
            mode: {
              type: 'string',
              enum: ['schedule', 'draft', 'now'],
              description: 'Modo de publicação: "schedule" (agendar), "draft" (rascunho) ou "now" (publicar imediatamente)'
            },
            type: {
              type: 'string',
              enum: ['post', 'story', 'reel'],
              description: 'Tipo do post (post, story ou reel)'
            },
            firstComment: {
              type: 'string',
              description: 'Primeiro comentário automático (hashtags, links adicionais)'
            },
            needsApproval: {
              type: 'boolean',
              description: 'Se true, envia o post para o status "in_review" para aprovação do cliente'
            }
          }
        }
      },
      {
        name: 'get_social_analytics',
        description: 'Retorna métricas consolidadas de desempenho de redes sociais da subconta (total de posts agendados, taxa de publicação, redes ativas e histórico).',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      },
      {
        name: 'list_crm_contacts',
        description: 'Consulta contatos do CRM com filtros por tag ou busca de texto.',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Termo de busca (nome, e-mail ou telefone)' },
            tag: { type: 'string', description: 'Filtrar por tag específica' },
            limit: { type: 'number', description: 'Limite de contatos (padrão 20)' }
          }
        }
      },
      {
        name: 'send_social_message',
        description: 'Envia ou registra uma resposta/mensagem no Inbox para um contato (Instagram, Facebook, WhatsApp, E-mail ou SMS).',
        inputSchema: {
          type: 'object',
          properties: {
            contactId: { type: 'string', description: 'ID do contato no CRM' },
            body: { type: 'string', description: 'Texto da mensagem' },
            channel: { type: 'string', enum: ['Instagram', 'Facebook', 'WhatsApp', 'Email', 'SMS', 'Live chat', 'Note'], description: 'Canal de envio' }
          },
          required: ['contactId', 'body', 'channel']
        }
      }
    ];
  }

  async function callTool(initialState, name, args, { workspace, actor }) {
    let state = initialState;
    try { state = await store.load(workspace); } catch { state = initialState; }
    switch (name) {
      case 'list_social_accounts': {
        const accounts = (state.socialAccounts || []).map(a => ({
          id: a.id,
          provider: a.provider,
          name: a.name,
          handle: a.handle,
          status: a.status
        }));
        return { accounts, count: accounts.length };
      }
      case 'list_scheduled_posts': {
        const status = args.status || 'all';
        const limit = Math.min(50, Math.max(1, Number(args.limit) || 20));
        let posts = state.socialPosts || [];
        if (status !== 'all') posts = posts.filter(p => p.status === status);
        posts = posts.sort((a, b) => (b.scheduleDate || b.created || '').localeCompare(a.scheduleDate || a.created || '')).slice(0, limit);
        return {
          posts: posts.map(p => ({
            id: p.id,
            summary: p.summary,
            status: p.status,
            scheduleDate: p.scheduleDate,
            type: p.type,
            accounts: (p.accountIds || []).map(id => state.socialAccounts?.find(a => a.id === id)?.name).filter(Boolean)
          })),
          total: posts.length
        };
      }
      case 'create_social_post': {
        const res = await change(workspace, {
          type: 'social-post',
          data: {
            summary: args.summary,
            accountIds: args.accountIds || [],
            scheduleDate: args.scheduleDate,
            mode: args.mode || (args.scheduleDate ? 'schedule' : 'draft'),
            type: args.type || 'post',
            firstComment: args.firstComment || '',
            needsApproval: Boolean(args.needsApproval)
          },
          actor: actor || 'AI Agent (MCP)'
        });
        const resultId = res?.id || res;
        return { success: true, postId: resultId, message: 'Publicação criada com sucesso no Social Planner da Soci.' };
      }
      case 'get_social_analytics': {
        const posts = state.socialPosts || [];
        const accounts = state.socialAccounts || [];
        const published = posts.filter(p => p.status === 'published').length;
        const scheduled = posts.filter(p => p.status === 'scheduled').length;
        const inReview = posts.filter(p => p.status === 'in_review').length;
        const failed = posts.filter(p => p.status === 'failed').length;
        return {
          totalAccounts: accounts.length,
          connectedAccounts: accounts.filter(a => a.status === 'connected').map(a => `${a.name} (${a.provider})`),
          postsSummary: {
            total: posts.length,
            published,
            scheduled,
            inReview,
            failed
          }
        };
      }
      case 'list_crm_contacts': {
        let contacts = state.contacts || [];
        if (args.tag) contacts = contacts.filter(c => (c.tags || []).includes(args.tag));
        if (args.query) {
          const q = String(args.query).toLowerCase();
          contacts = contacts.filter(c => (c.name || '').toLowerCase().includes(q) || (c.email || '').toLowerCase().includes(q) || (c.phone || '').includes(q));
        }
        const limit = Math.min(50, Math.max(1, Number(args.limit) || 20));
        return {
          contacts: contacts.slice(0, limit).map(c => ({
            id: c.id,
            name: c.name,
            email: c.email,
            phone: c.phone,
            tags: c.tags
          })),
          count: Math.min(contacts.length, limit),
          totalMatching: contacts.length
        };
      }
      case 'send_social_message': {
        const contactId = String(args.contactId || '').trim();
        const body = String(args.body || '').trim();
        const channel = String(args.channel || 'Instagram').trim();
        if (!contactId || !body) throw new Error('contactId e body são obrigatórios.');
        const res = await change(workspace, {
          type: 'message',
          data: {
            contactId,
            body,
            channel,
            direction: 'Outbound'
          }
        }, { name: actor });
        return { ok: true, messageId: res?.id || res };
      }
      default:
        throw Object.assign(new Error(`Ferramenta desconhecida: ${name}`), { code: -32601 });
    }
  }

  async function handleMcpRequest(body, { state, workspace, actor }) {
    const { jsonrpc, id, method, params } = body || {};
    if (jsonrpc !== '2.0' && !method) {
      return { jsonrpc: '2.0', id: id ?? null, error: { code: -32600, message: 'Invalid Request' } };
    }

    if (method === 'initialize') {
      return {
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: { listChanged: false },
            prompts: { listChanged: false }
          },
          serverInfo: {
            name: 'soci-mcp-server',
            version: '1.0.0'
          }
        }
      };
    }

    if (method === 'notifications/initialized') {
      return null;
    }

    if (method === 'ping') {
      return { jsonrpc: '2.0', id, result: {} };
    }

    if (method === 'tools/list') {
      return {
        jsonrpc: '2.0',
        id,
        result: {
          tools: listTools()
        }
      };
    }

    if (method === 'tools/call') {
      const toolName = params?.name;
      const toolArgs = params?.arguments || {};
      try {
        const result = await callTool(state, toolName, toolArgs, { workspace, actor });
        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result, null, 2)
              }
            ],
            isError: false
          }
        };
      } catch (err) {
        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [
              {
                type: 'text',
                text: `Erro ao executar ${toolName}: ${err.stack || err.message}`
              }
            ],
            isError: true
          }
        };
      }
    }

    if (method === 'prompts/list') {
      return {
        jsonrpc: '2.0',
        id,
        result: {
          prompts: [
            {
              name: 'social_content_planner',
              description: 'Gera uma sugestão estratégica de conteúdo semanal para o nicho da empresa.',
              arguments: [
                { name: 'niche', description: 'Nicho ou segmento de mercado da empresa', required: true }
              ]
            }
          ]
        }
      };
    }

    return {
      jsonrpc: '2.0',
      id,
      error: { code: -32601, message: `Method not found: ${method}` }
    };
  }

  return { listTools, callTool, handleMcpRequest };
}
