#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
OPEN_WEBUI_DIR="$ROOT/open-webui"
cd "$OPEN_WEBUI_DIR"

if [[ ! -d ".venv" ]]; then
  echo "Virtual environment not found. Run:"
  echo "  ./ai-script/ow-install.sh"
  exit 1
fi

VENV_PYTHON="$OPEN_WEBUI_DIR/.venv/bin/python"
OPEN_WEBUI_ENTRY="$OPEN_WEBUI_DIR/.venv/bin/open-webui"

if [[ ! -x "$VENV_PYTHON" || ! -f "$OPEN_WEBUI_ENTRY" ]]; then
  echo "Open WebUI virtual environment is incomplete. Reinstall it with:"
  echo "  ./ai-script/ow-install.sh --force"
  exit 1
fi

# Set the environment explicitly: activation scripts may contain paths from before migration.
export VIRTUAL_ENV="$OPEN_WEBUI_DIR/.venv"
export PATH="$VIRTUAL_ENV/bin:$PATH"

if [[ -f "$OPEN_WEBUI_DIR/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$OPEN_WEBUI_DIR/.env"
  set +a
fi

export OLLAMA_BASE_URL="${OLLAMA_BASE_URL:-http://127.0.0.1:11434}"
export DATA_DIR="${DATA_DIR:-$OPEN_WEBUI_DIR/data}"
export PORT="${PORT:-8080}"
export HOST="${HOST:-0.0.0.0}"

if [[ "$DATA_DIR" != /* ]]; then
  DATA_DIR="$OPEN_WEBUI_DIR/$DATA_DIR"
  export DATA_DIR
fi

export NO_PROXY="${NO_PROXY:-localhost,127.0.0.1,::1}"
export no_proxy="${no_proxy:-$NO_PROXY}"
export ENABLE_COMPRESSION_MIDDLEWARE="${ENABLE_COMPRESSION_MIDDLEWARE:-false}"

mkdir -p "$DATA_DIR"

if ! curl -sf --connect-timeout 2 "${OLLAMA_BASE_URL}/" >/dev/null 2>&1; then
  echo "Warning: Ollama is not reachable at ${OLLAMA_BASE_URL}"
  echo "         Open WebUI will still start, but local models may be unavailable."
fi

echo "Starting Open WebUI..."
echo "Ollama API: ${OLLAMA_BASE_URL}"
echo "Data dir:   ${DATA_DIR}"
echo
echo "Note: first startup can take 2-5 minutes while models and dependencies load."
echo "      The banner in the logs does NOT mean the server is ready yet."
echo "      Wait for the 'Ready' message below before opening the browser."
echo "Press Ctrl+C to stop."
echo

OW_PID=""
cleanup() {
  if [[ -n "$OW_PID" ]] && kill -0 "$OW_PID" 2>/dev/null; then
    kill "$OW_PID" 2>/dev/null || true
    wait "$OW_PID" 2>/dev/null || true
  fi
}
trap cleanup INT TERM

"$VENV_PYTHON" "$OPEN_WEBUI_ENTRY" serve --host "$HOST" --port "$PORT" &
OW_PID=$!

READY=0
for _ in $(seq 1 180); do
  if ! kill -0 "$OW_PID" 2>/dev/null; then
    wait "$OW_PID"
    exit 1
  fi

  if curl -sf --connect-timeout 1 "http://127.0.0.1:${PORT}/" >/dev/null 2>&1; then
    READY=1
    break
  fi

  sleep 2
done

if [[ "$READY" -eq 1 ]]; then
  echo
  echo "Ready: http://localhost:${PORT}"
  echo
else
  echo
  echo "Open WebUI is still starting. Check the logs above, then try:"
  echo "  http://localhost:${PORT}"
  echo
fi

wait "$OW_PID"
