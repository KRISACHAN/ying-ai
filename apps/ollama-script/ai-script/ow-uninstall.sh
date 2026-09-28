#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
OPEN_WEBUI_DIR="$ROOT/open-webui"
PORT="${PORT:-8080}"
BACKUP=0
KEEP_DATA=0
VENV_ONLY=0
YES=0

usage() {
  cat <<'EOF'
Usage:
  ./ai-script/ow-uninstall.sh [options]

Uninstall Open WebUI from ./open-webui.

Options:
  -y, --yes        Skip confirmation prompt
  -b, --backup     Backup data/config before uninstall
  --keep-data      Remove .venv and config only, keep ./open-webui/data
  --venv-only      Remove virtual environment only
  -h, --help       Show this help

Examples:
  ./ai-script/ow-uninstall.sh
  ./ai-script/ow-uninstall.sh --backup
  ./ai-script/ow-uninstall.sh --keep-data
  ./ai-script/ow-uninstall.sh -y --backup
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -y | --yes)
      YES=1
      shift
      ;;
    -b | --backup)
      BACKUP=1
      shift
      ;;
    --keep-data)
      KEEP_DATA=1
      shift
      ;;
    --venv-only)
      VENV_ONLY=1
      shift
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [[ "$KEEP_DATA" -eq 1 && "$VENV_ONLY" -eq 1 ]]; then
  echo "Error: --keep-data and --venv-only cannot be used together." >&2
  exit 1
fi

if [[ ! -d "$OPEN_WEBUI_DIR" ]]; then
  echo "Nothing to uninstall: ${OPEN_WEBUI_DIR} does not exist."
  exit 0
fi

PIDS="$(lsof -t -i:"${PORT}" -sTCP:LISTEN 2>/dev/null || true)"
if [[ -n "$PIDS" ]]; then
  echo "Stopping Open WebUI on port ${PORT}..."
  # shellcheck disable=SC2086
  kill $PIDS 2>/dev/null || true
  sleep 1

  PIDS="$(lsof -t -i:"${PORT}" -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -n "$PIDS" ]]; then
    echo "Force stopping remaining process(es)..."
    # shellcheck disable=SC2086
    kill -9 $PIDS 2>/dev/null || true
  fi
fi

if [[ "$VENV_ONLY" -eq 1 ]]; then
  ACTION="remove the virtual environment at ${OPEN_WEBUI_DIR}/.venv"
elif [[ "$KEEP_DATA" -eq 1 ]]; then
  ACTION="remove Open WebUI program and config, but keep ${OPEN_WEBUI_DIR}/data"
else
  ACTION="completely remove ${OPEN_WEBUI_DIR}"
fi

if [[ "$YES" -ne 1 ]]; then
  echo "This will ${ACTION}."
  read -r -p "Continue? [y/N] " reply
  if [[ ! "$reply" =~ ^[Yy]$ ]]; then
    echo "Cancelled."
    exit 0
  fi
fi

if [[ "$BACKUP" -eq 1 ]]; then
  BACKUP_DIR="$ROOT/open-webui-backup-$(date +%Y%m%d-%H%M%S)"
  echo "Creating backup at ${BACKUP_DIR}..."
  mkdir -p "$BACKUP_DIR"

  if [[ -d "$OPEN_WEBUI_DIR/data" ]]; then
    cp -a "$OPEN_WEBUI_DIR/data" "$BACKUP_DIR/data"
  fi

  for file in .env .webui_secret_key; do
    if [[ -f "$OPEN_WEBUI_DIR/$file" ]]; then
      cp -a "$OPEN_WEBUI_DIR/$file" "$BACKUP_DIR/$file"
    fi
  done
fi

if [[ "$VENV_ONLY" -eq 1 ]]; then
  echo "Removing virtual environment..."
  rm -rf "$OPEN_WEBUI_DIR/.venv"
elif [[ "$KEEP_DATA" -eq 1 ]]; then
  echo "Removing program and config..."
  rm -rf "$OPEN_WEBUI_DIR/.venv"
  rm -f "$OPEN_WEBUI_DIR/.env" "$OPEN_WEBUI_DIR/.webui_secret_key"
else
  echo "Removing Open WebUI directory..."
  rm -rf "$OPEN_WEBUI_DIR"
fi

echo
echo "Open WebUI uninstalled."

if [[ "$BACKUP" -eq 1 ]]; then
  echo "  Backup: ${BACKUP_DIR}"
fi

if [[ "$KEEP_DATA" -eq 1 ]]; then
  echo "  Kept:   ${OPEN_WEBUI_DIR}/data"
fi

echo "  Reinstall with: ./ai-script/ow-install.sh"
