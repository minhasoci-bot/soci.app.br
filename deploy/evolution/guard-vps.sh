#!/usr/bin/env bash
# Vigia da VPS (agendada pelo install.sh a cada 10 minutos).
#   1. Container que deveria estar no ar e não está: sobe de novo.
#   2. Disco enchendo: limpa o que o Docker não usa; no limite, backups antigos (guarda os 3 mais novos).
# Só escreve no log quando faz alguma coisa.
set -uo pipefail
cd "$(dirname "$0")" || exit 1
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
stamp() { date '+%Y-%m-%d %H:%M:%S'; }
used() { df --output=pcent / | tail -n1 | tr -dc '0-9'; }

# Uma execução por vez: a anterior pode estar baixando imagem.
exec 9>/tmp/evolution-guard.lock
flock -n 9 || exit 0

if ! docker info >/dev/null 2>&1; then
  echo "$(stamp) Docker parado: reiniciando o serviço"
  systemctl restart docker || { echo "$(stamp) ERRO: o Docker não subiu"; exit 1; }
  sleep 10
fi

# Serviços que já existem como container (o modo da VPS decide quais são) e não estão rodando.
stopped=$(docker compose ps -a --format '{{.Service}} {{.State}}' 2>/dev/null | awk '$2 != "running" && $2 != "restarting" {print $1}')
if [ -n "$stopped" ]; then
  # shellcheck disable=SC2086
  echo "$(stamp) parados: $(echo $stopped). Subindo de novo"
  # shellcheck disable=SC2086
  docker compose up -d $stopped >/dev/null 2>&1 || echo "$(stamp) ERRO: não foi possível subir: $(echo $stopped)"
fi

disk=$(used)
if [ "${disk:-0}" -ge 85 ]; then
  echo "$(stamp) disco em ${disk}%: limpando imagens e cache do Docker"
  docker image prune -f >/dev/null 2>&1 || true
  docker builder prune -f >/dev/null 2>&1 || true
  journalctl --vacuum-size=200M >/dev/null 2>&1 || true
  if [ "$(used)" -ge 92 ]; then
    echo "$(stamp) disco ainda em $(used)%: apagando backups antigos (ficam os 3 mais novos)"
    find backups -name 'evolution-*.sql.gz' -printf '%T@ %p\n' 2>/dev/null | sort -rn | tail -n +4 | cut -d' ' -f2- | while read -r old; do rm -f "$old"; done
  fi
  echo "$(stamp) disco agora em $(used)%"
fi
