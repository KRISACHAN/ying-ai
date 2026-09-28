#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
COMFYUI_DIR="$ROOT/comfyui"
cd "$COMFYUI_DIR/ComfyUI"

VENV_PYTHON="$COMFYUI_DIR/.venv/bin/python"
if [[ ! -x "$VENV_PYTHON" ]]; then
  echo "Virtual environment not found. Run setup from $COMFYUI_DIR first."
  exit 1
fi

# Set the environment explicitly: activation scripts may contain paths from before migration.
export VIRTUAL_ENV="$COMFYUI_DIR/.venv"
export PATH="$VIRTUAL_ENV/bin:$PATH"

if [[ -f "$COMFYUI_DIR/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$COMFYUI_DIR/.env"
  set +a
fi

export PORT="${PORT:-8188}"
export HOST="${HOST:-0.0.0.0}"

echo "ComfyUI: http://localhost:${PORT}"
echo "Models:  $COMFYUI_DIR/ComfyUI/models"
echo "Press Ctrl+C to stop."

exec "$VENV_PYTHON" main.py --listen "$HOST" --port "$PORT"
