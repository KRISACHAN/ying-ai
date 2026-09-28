#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
OPEN_WEBUI_DIR="$ROOT/open-webui"
PYTHON_VERSION="${PYTHON_VERSION:-3.12}"
PORT="${PORT:-8080}"
FORCE=0

usage() {
  cat <<'EOF'
Usage:
  ./ai-script/ow-install.sh [options] [version]

Install Open WebUI into ./open-webui using uv + Python venv.

Arguments:
  version          PyPI version, e.g. 0.10.2 (default: latest)

Options:
  -f, --force      Remove existing .venv and reinstall
  -h, --help       Show this help

Examples:
  ./ai-script/ow-install.sh
  ./ai-script/ow-install.sh 0.10.2
  ./ai-script/ow-install.sh --force 0.9.6

After install:
  ./ai-script/ow-start.sh
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -f | --force)
      FORCE=1
      shift
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    -*)
      echo "Unknown option: $1" >&2
      usage
      exit 1
      ;;
    *)
      OPEN_WEBUI_VERSION="$1"
      shift
      ;;
  esac
done

OPEN_WEBUI_VERSION="${OPEN_WEBUI_VERSION:-latest}"

if ! command -v uv >/dev/null 2>&1; then
  echo "Error: uv is not installed." >&2
  echo "Install it with: curl -LsSf https://astral.sh/uv/install.sh | sh" >&2
  exit 1
fi

mkdir -p "$OPEN_WEBUI_DIR"
cd "$OPEN_WEBUI_DIR"

if [[ "$FORCE" -eq 1 && -d ".venv" ]]; then
  echo "Removing existing virtual environment..."
  rm -rf ".venv"
fi

if [[ ! -d ".venv" ]]; then
  echo "Creating Python ${PYTHON_VERSION} virtual environment..."
  uv venv --python "$PYTHON_VERSION" .venv
fi

if [[ "$OPEN_WEBUI_VERSION" == "latest" ]]; then
  PACKAGE="open-webui"
  echo "Installing latest open-webui..."
else
  PACKAGE="open-webui==${OPEN_WEBUI_VERSION}"
  echo "Installing open-webui ${OPEN_WEBUI_VERSION}..."
fi

uv pip install --python "$OPEN_WEBUI_DIR/.venv/bin/python" --upgrade "$PACKAGE"

if [[ ! -f ".env" ]]; then
  echo "Creating .env..."
  cat > .env <<EOF
OLLAMA_BASE_URL=http://127.0.0.1:11434
DATA_DIR=./data
PORT=${PORT}
HOST=0.0.0.0

NO_PROXY=localhost,127.0.0.1,::1
ENABLE_COMPRESSION_MIDDLEWARE=false
DEFAULT_MODEL_PARAMS='{"num_ctx":16384}'
EOF
else
  echo "Keeping existing .env"
fi

mkdir -p data

INSTALLED_VERSION="$("$OPEN_WEBUI_DIR/.venv/bin/python" -c "import importlib.metadata; print(importlib.metadata.version('open-webui'))")"

chmod +x "$SCRIPT_DIR/ow-start.sh" 2>/dev/null || true

echo
echo "Open WebUI installed successfully."
echo "  Version:  ${INSTALLED_VERSION}"
echo "  Location: ${OPEN_WEBUI_DIR}"
echo "  Start:    ${SCRIPT_DIR}/ow-start.sh"
echo "  URL:      http://localhost:${PORT}"
echo
echo "Tip: use 'proxy' before install if download is slow, then 'noproxy' before starting."
