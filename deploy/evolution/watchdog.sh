#!/bin/sh
# Vigia das instâncias da Evolution API. Roda em loop dentro do container "watchdog".
#
# - Número que já foi pareado e caiu ("close") por motivo que não seja logout/banimento: pede reconexão.
#   A sessão está salva no Postgres, então reconecta sem novo QR Code.
# - Instância pareada presa em "connecting" por WATCHDOG_STUCK_CYCLES checagens seguidas: reinicia.
# - Logout (401) e banimento/bloqueio (403) ficam como estão: só o cliente resolve, lendo o QR de novo.
# - API sem responder: só registra. Quem reinicia o container é o autoheal, pelo healthcheck.
set -u

URL="${EVOLUTION_URL:-http://evolution:8080}"
KEY="${AUTHENTICATION_API_KEY:?defina AUTHENTICATION_API_KEY}"
INTERVAL="${WATCHDOG_INTERVAL:-60}"
STUCK="${WATCHDOG_STUCK_CYCLES:-10}"
STATE=/tmp/watchdog
mkdir -p "$STATE"

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') $*"; }
api() { curl -sS -m 30 -o /dev/null -w '%{http_code}' -H "apikey: $KEY" "$@"; }

log "vigia iniciado: checagem a cada ${INTERVAL}s, reinício após ${STUCK} checagens presas"
sleep 60

while true; do
  list=$(curl -fsS -m 20 -H "apikey: $KEY" "$URL/instance/fetchInstances" 2>/dev/null)
  if [ -z "$list" ] || ! echo "$list" | jq -e 'type == "array"' >/dev/null 2>&1; then
    log "AVISO: a Evolution API não respondeu à listagem de instâncias"
    sleep "$INTERVAL"
    continue
  fi

  echo "$list" | jq -r '.[] | [(.name // .instanceName // ""), (.connectionStatus // ""), (.ownerJid // ""), ((.disconnectionReasonCode // 0) | tostring)] | @tsv' |
  while IFS="$(printf '\t')" read -r name status owner code; do
    [ -n "$name" ] || continue
    file="$STATE/$(echo "$name" | tr -c 'A-Za-z0-9_-' '_')"
    path=$(printf '%s' "$name" | jq -sRr @uri)
    case "$status" in
      open)
        rm -f "$file"
        ;;
      close)
        rm -f "$file"
        if [ -n "$owner" ] && [ "$code" != "401" ] && [ "$code" != "403" ]; then
          http=$(api "$URL/instance/connect/$path")
          log "$name caiu (motivo $code): reconexão pedida (HTTP $http)"
        fi
        ;;
      connecting)
        n=$(( $(cat "$file" 2>/dev/null || echo 0) + 1 ))
        echo "$n" > "$file"
        if [ -n "$owner" ] && [ "$code" != "401" ] && [ "$code" != "403" ] && [ "$n" -ge "$STUCK" ]; then
          http=$(api -X POST "$URL/instance/restart/$path")
          [ "$http" = "404" ] || [ "$http" = "405" ] && http=$(api -X PUT "$URL/instance/restart/$path")
          log "$name presa em connecting há $n checagens: reinício pedido (HTTP $http)"
          echo 0 > "$file"
        fi
        ;;
    esac
  done

  sleep "$INTERVAL"
done
