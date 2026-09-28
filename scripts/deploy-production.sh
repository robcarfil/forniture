#!/usr/bin/env bash
set -Eeuo pipefail

# Uso:
#   ./scripts/deploy-production.sh [versione]
#
# Variabili configurabili:
#   DEPLOY_HOST=admin@100.119.243.68
#   DEPLOY_DIR=/mnt/ONE-TB/tank/projects/generapp
#   DEPLOY_ENV_FILE=/percorso/.env  # opzionale
#   DEPLOY_PASSWORD=...    # richiede sshpass
#
# Il file .env deve essere già presente nella directory di produzione.

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION="${1:-$(node -p "require('./package.json').version") }"
VERSION="${VERSION// /}"
DEPLOY_HOST="${DEPLOY_HOST:-admin@100.119.243.68}"
DEPLOY_DIR="${DEPLOY_DIR:-/mnt/ONE-TB/tank/projects/generapp}"
ARCHIVE="generapp-${VERSION}.tar"
REMOTE_ARCHIVE="/tmp/${ARCHIVE}"

cd "$PROJECT_DIR"

command -v ssh >/dev/null || { echo "Errore: ssh non disponibile" >&2; exit 1; }
command -v scp >/dev/null || { echo "Errore: scp non disponibile" >&2; exit 1; }
command -v tar >/dev/null || { echo "Errore: tar non disponibile" >&2; exit 1; }

SSH_CMD=(ssh)
SCP_CMD=(scp)
if [[ -n "${DEPLOY_PASSWORD:-}" ]]; then
  command -v sshpass >/dev/null || {
    echo "Errore: DEPLOY_PASSWORD richiede il comando sshpass" >&2
    exit 1
  }
  export SSHPASS="$DEPLOY_PASSWORD"
  SSH_CMD=(sshpass -e ssh)
  SCP_CMD=(sshpass -e scp)
fi

echo "Creo ${ARCHIVE}..."
rm -f "$ARCHIVE"
tar \
  --exclude='./.git' \
  --exclude='./node_modules' \
  --exclude='./.next' \
  --exclude='./out' \
  --exclude='./.DS_Store' \
  --exclude='./.data' \
  --exclude='./.env' \
  --exclude='./generapp-truenas-*.tar' \
  --exclude="./${ARCHIVE}" \
  -cf "$ARCHIVE" .

echo "Trasferisco ${ARCHIVE} su ${DEPLOY_HOST}..."
"${SCP_CMD[@]}" "$ARCHIVE" "${DEPLOY_HOST}:${REMOTE_ARCHIVE}"

echo "Sostituisco il codice e avvio il deploy..."
"${SSH_CMD[@]}" "$DEPLOY_HOST" "REMOTE_ARCHIVE='$REMOTE_ARCHIVE' DEPLOY_DIR='$DEPLOY_DIR' ARCHIVE='$ARCHIVE' APP_VERSION='$VERSION' DEPLOY_ENV_FILE='${DEPLOY_ENV_FILE:-}' bash -s" <<'REMOTE_SCRIPT'
set -Eeuo pipefail

if [[ "$DEPLOY_DIR" != /mnt/*/projects/* && "$DEPLOY_DIR" != /opt/* && "$DEPLOY_DIR" != /srv/* ]]; then
  echo "Directory di deploy non consentita: $DEPLOY_DIR" >&2
  exit 1
fi

if [[ -z "$DEPLOY_DIR" || "$DEPLOY_DIR" == "/" || "$DEPLOY_DIR" == "/mnt" ]]; then
  echo "Directory di deploy non sicura: $DEPLOY_DIR" >&2
  exit 1
fi

ENV_BACKUP="$(mktemp)"
cleanup() { rm -f "$ENV_BACKUP" "$REMOTE_ARCHIVE"; }
trap cleanup EXIT

ENV_SOURCE="${DEPLOY_ENV_FILE:-$DEPLOY_DIR/.env}"
if [[ ! -f "$ENV_SOURCE" && -f "$(dirname "$DEPLOY_DIR")/.env" ]]; then
  ENV_SOURCE="$(dirname "$DEPLOY_DIR")/.env"
fi

if [[ -f "$ENV_SOURCE" ]]; then
  cp "$ENV_SOURCE" "$ENV_BACKUP"
else
  echo "Errore: file .env non trovato. Cercati: $DEPLOY_DIR/.env e $(dirname "$DEPLOY_DIR")/.env" >&2
  exit 1
fi

rm -rf -- "$DEPLOY_DIR"
mkdir -p -- "$DEPLOY_DIR"
tar -xf "$REMOTE_ARCHIVE" -C "$DEPLOY_DIR"
cp "$ENV_BACKUP" "$DEPLOY_DIR/.env"

cd "$DEPLOY_DIR"
export APP_VERSION
docker compose config >/dev/null
docker compose up -d --build --remove-orphans
docker compose ps
REMOTE_SCRIPT

echo "Deploy completato: ${DEPLOY_HOST}:${DEPLOY_DIR}"
