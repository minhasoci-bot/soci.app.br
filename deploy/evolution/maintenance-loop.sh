#!/bin/sh
# Manutenção diária dentro de um container (modo PC): às 03:30, ou na primeira hora em que o PC
# estiver ligado depois disso, faz backup do Postgres e apaga mensagens antigas.
set -u
# Sem isto, um pg_dump que falha no meio viraria um backup "ok" vazio.
set -o pipefail
KEEP_MSG="${MESSAGE_RETENTION_DAYS:-30}"
KEEP_BKP="${BACKUP_RETENTION_DAYS:-7}"
stamp() { date '+%Y-%m-%d %H:%M:%S'; }

run() {
  file="/backups/evolution-$(date +%Y%m%d-%H%M).sql.gz"
  if pg_dump --no-owner --clean --if-exists | gzip -6 > "$file.tmp"; then
    mv "$file.tmp" "$file"
    echo "$(stamp) backup ok: $file"
  else
    rm -f "$file.tmp"
    echo "$(stamp) ERRO no backup do Postgres"
  fi
  find /backups -name 'evolution-*.sql.gz' -mtime +"$KEEP_BKP" -delete
  n=$(psql -tAc "WITH gone AS (DELETE FROM \"Message\" WHERE \"messageTimestamp\" < extract(epoch FROM now() - interval '${KEEP_MSG} days') RETURNING 1) SELECT count(*) FROM gone;" 2>&1) \
    && echo "$(stamp) mensagens antigas apagadas: $n" \
    || echo "$(stamp) AVISO: limpeza falhou: $n"
  date +%Y%m%d > /backups/.last-run
}

echo "$(stamp) manutenção iniciada"
while true; do
  today=$(date +%Y%m%d)
  last=$(cat /backups/.last-run 2>/dev/null || echo 0)
  if [ "$last" != "$today" ] && [ "$(date +%H%M)" -ge 0330 ]; then run; fi
  sleep 600
done
