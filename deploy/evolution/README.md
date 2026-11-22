# WhatsApp do soci.app com Evolution API na VPS da Hostinger

Esta pasta sobe a Evolution API v2.3.7 numa VPS e liga o soci.app a ela. Depois disso, cada subconta conecta o próprio número lendo um QR Code.

## Por que a Evolution costuma cair, e o que esta configuração faz

| Problema comum | O que está configurado |
|---|---|
| Atualização automática para uma versão com bug | Versão fixa `v2.3.7` (a última estável). A 2.4 exige ativação de licença e ainda é pré-release. |
| Reiniciou e pediu QR Code de novo | Sessões no Postgres (`DATABASE_SAVE_DATA_INSTANCE=true`, `CACHE_REDIS_SAVE_INSTANCES=false`) e volume persistente. |
| Container travado, mas ainda "vivo" | Healthcheck mais **autoheal**, que reinicia o container travado em até ~2 min. |
| Número caiu e ficou desconectado | **watchdog**: reconecta quem caiu e reinicia instância presa em "connecting" há 10 min. Não mexe em logout nem em banimento. |
| VPS sem memória: o Linux mata o processo | Swap automático, teto de memória por container e integrações que o soci não usa desligadas. |
| Disco cheio por logs e mensagens | Rotação de logs do Docker e limpeza diária de mensagens com mais de 30 dias. |
| Mensagem "Aguardando mensagem" no celular do cliente | Mensagens novas ficam salvas para o WhatsApp poder pedir reenvio. |
| Webhook perdido durante uma queda | Ao enviar, o soci confere o status ao vivo e regrava o webhook a cada conexão. |
| Atualizar o Docker derruba tudo | `live-restore` no Docker e `restart: unless-stopped` em todos os serviços. |
| Ataque ao SSH ou a portas abertas | Firewall (só 22, 80 e 443), fail2ban e atualizações de segurança automáticas (reinício às 04:30, quando necessário). |

## 1. Contratar a VPS

- Plano: **KVM 2** (2 vCPU, 8 GB RAM) é folgado para dezenas de números. O **KVM 1** (4 GB) atende até cerca de 10 números.
- Sistema: **Ubuntu 24.04 LTS** puro, sem painel. Não escolha o modelo "Evolution API" da Hostinger: ele usa outra configuração.
- Local: Brasil, se tiver. Senão, o mais próximo.
- Defina uma senha root forte. Se puder, cadastre também uma chave SSH.
- No firewall do painel da Hostinger (se estiver ativo), libere as portas 22, 80 e 443.

## 2. Apontar o subdomínio

No DNS do seu domínio, crie um registro **A**:

| Tipo | Nome | Valor |
|---|---|---|
| A | `whatsapp` | IP da VPS |

Se o domínio estiver na Cloudflare, deixe a nuvem **cinza** (DNS only). Assim o certificado HTTPS é emitido direto na VPS.

## 3. Enviar esta pasta e instalar

No PowerShell do seu computador, na pasta do projeto:

```powershell
scp -r deploy/evolution root@IP_DA_VPS:/opt/evolution
```

```powershell
ssh root@IP_DA_VPS
```

Já dentro da VPS:

```bash
cd /opt/evolution
bash install.sh whatsapp.seudominio.com.br seu@email.com
```

Ao final, o script mostra a **URL** e a **API Key global**. Guarde a chave num cofre de senhas.

## 4. Ligar o soci.app

Na Vercel, abra o projeto soci.app e vá em **Settings → Environment Variables** (Production):

```
EVOLUTION_BASE_URL = https://whatsapp.seudominio.com.br
EVOLUTION_API_KEY  = (a API Key global)
```

Faça um novo deploy. Pronto: **Agência → WhatsApp** mostra "Servidor Evolution API gerenciado pela plataforma". Cada subconta conecta em **Configurações → WhatsApp → Conectar** e lê o QR Code.

Outro caminho, sem variável de ambiente: em **Agência → WhatsApp → Usar servidor próprio**, escolha *Evolution API* e cole a URL e a chave. A chave fica criptografada no banco.

## Dia a dia

```bash
cd /opt/evolution
docker compose ps                         # todos devem estar "Up (healthy)"
docker compose logs --tail 100 evolution  # erros da API
docker compose logs --tail 50 watchdog    # quedas e reconexões automáticas
docker compose restart evolution          # reinício manual (as sessões continuam)
tail -n 20 /var/log/evolution-maintenance.log
```

O painel da Evolution fica em `https://whatsapp.seudominio.com.br/manager` (o login usa a API Key global).

### Atualizar a Evolution

Antes de atualizar, leia as notas da versão em <https://github.com/EvolutionAPI/evolution-api/releases>. Depois troque a tag `image:` no `docker-compose.yml` e rode:

```bash
bash maintenance.sh            # backup antes
docker compose pull evolution && docker compose up -d evolution
```

Se der problema, volte a tag anterior e rode `docker compose up -d evolution` de novo.

### Restaurar um backup

Os backups diários ficam em `/opt/evolution/backups` (7 dias):

```bash
docker compose stop evolution
gunzip -c backups/evolution-AAAAMMDD-HHMM.sql.gz | docker compose exec -T postgres psql -U evolution -d evolution
docker compose start evolution
```

### Monitoramento externo (recomendado)

Cadastre `https://whatsapp.seudominio.com.br/` num monitor gratuito, como UptimeRobot ou Better Stack, para receber um alerta se a VPS inteira cair.

## Limites

- A Evolution usa o WhatsApp Web (não é a API oficial da Meta). Ela não cai por causa do servidor, mas o WhatsApp pode **banir números** que disparam muitas mensagens para quem não conhece. Aqueça números novos e evite listas frias.
- Se o cliente remover o aparelho no celular (logout), só ele resolve, lendo o QR de novo. O watchdog não insiste nesses casos.
- Mensagens de grupos e de status são ignoradas: o soci.app trata apenas conversas individuais.
