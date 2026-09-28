# Ollama Script

**English** | [简体中文](README.zh-CN.md)

Local Ollama, Open WebUI, and ComfyUI workflow scripts, migrated from `ying-ollama-script` into `ying-ai/apps/ollama-script`. The workspace package is `@ying-ai/ollama-script`.

## Layout

```txt
ollama-script/
├── ai-script/          Open WebUI install/start/uninstall and ComfyUI start scripts
├── script/
│   ├── flux.js         Interactive image generation
│   ├── flux-run.js     Command-line image generation
│   └── lib/            Paths, input files, reference images, and Ollama requests
├── README.md
├── README.zh-CN.md
└── package.json
```

Local data is ignored by Git: `prompts/`, `images/`, `results/`, `open-webui/`, `comfyui/`, `archive/`, and `open-webui-backup-*/`. All script paths resolve relative to this app, independently of the terminal's working directory.

## Setup

Install workspace dependencies from the `ying-ai` repository root, then prepare local inputs:

```bash
pnpm install
cd apps/ollama-script
mkdir -p prompts images results
# Create prompts/image.md and optionally add reference images under images/.
```

You need Ollama with the desired model available locally. Open WebUI installation also requires `uv` and Python (default: `3.12`). For ComfyUI, prepare its source at `comfyui/ComfyUI/` and a Python environment with its dependencies at `comfyui/.venv/` before starting it; this app does not install ComfyUI.

Existing local data was moved into the app during migration. Local environments and data are not included in Git; a fresh checkout must prepare its own local data.

## Commands

From the repository root:

```bash
pnpm ow:install
pnpm ow:start
pnpm ow:uninstall --help
pnpm comfy:start
pnpm flux
pnpm flux:run --help
pnpm flux:loop
pnpm --filter @ying-ai/ollama-script lint
```

From `apps/ollama-script`, the same scripts are available directly:

| Command             | Purpose                                                              |
| ------------------- | -------------------------------------------------------------------- |
| `pnpm ow:install`   | Install or update Open WebUI                                         |
| `pnpm ow:start`     | Start Open WebUI (default port 8080)                                 |
| `pnpm ow:uninstall` | Uninstall Open WebUI; see backup and data retention options below    |
| `pnpm comfy:start`  | Start an existing ComfyUI installation (default port 8188)           |
| `pnpm flux`         | Select a prompt, up to two reference images, and an output name      |
| `pnpm flux:run`     | Generate directly using `prompts/image.md` by default                |
| `pnpm flux:loop`    | Repeat interactive generation                                        |
| `pnpm lint`         | Check the JavaScript scripts with the workspace ESLint configuration |

These scripts run directly without a build step. The app has no `dev` or `build` task, so it is absent from the root development/build selectors and those Turbo tasks.

## Open WebUI

Run these commands from the app directory:

```bash
./ai-script/ow-install.sh
./ai-script/ow-install.sh 0.10.2
./ai-script/ow-install.sh --force
./ai-script/ow-start.sh
```

Wait for `Ready: http://localhost:8080` before opening the browser. First startup may take several minutes. After an update, refresh the browser if the displayed version has not changed.

Installation creates `open-webui/.env` if it does not exist and preserves existing configuration. It defaults to Ollama at `http://127.0.0.1:11434`, port `8080`, host `0.0.0.0`, and `DEFAULT_MODEL_PARAMS='{"num_ctx":16384}'`. A relative `DATA_DIR` is resolved against `open-webui/`.

Uninstall options:

```bash
./ai-script/ow-uninstall.sh --help
./ai-script/ow-uninstall.sh --backup
./ai-script/ow-uninstall.sh --keep-data
./ai-script/ow-uninstall.sh --venv-only
```

`--backup` copies data/config into an ignored `open-webui-backup-<timestamp>/` directory. `--keep-data` retains the data directory; `--venv-only` removes only the Python environment. The script asks for confirmation unless passed `-y`.

## ComfyUI

```bash
./ai-script/comfy-start.sh
# http://localhost:8188
```

Models live in `comfyui/ComfyUI/models/`. Optional configuration lives in `comfyui/.env`; `HOST` and `PORT` default to `0.0.0.0` and `8188`.

## Ollama image generation

The default model is `x/flux2-klein:9b`. Prepare it with:

```bash
ollama pull x/flux2-klein:9b
```

Interactive generation selects a file from `prompts/`, optionally selects up to two images from `images/`, and asks for an output name. An empty name uses a timestamp. Outputs are PNG files in `results/`.

Direct generation:

```bash
pnpm flux:run
node script/flux-run.js prompts/image.md
node script/flux-run.js -o my-shot prompts/1.md
node script/flux-run.js -i images/ref.jpg -o test prompts/1.md
node script/flux-run.js --help
```

The CLI also accepts width, height, steps, seed, negative prompt, model, and loop options. Relative prompt paths resolve against the app directory; relative reference-image paths resolve against the current working directory. Workspace package commands run in the app directory.

The existing workflow targets macOS image generation. Reference-image editing is experimental; the image model is separate from chat models.

## Environment variables and migrated Python environments

| Variable          | Default                     | Purpose                                                  |
| ----------------- | --------------------------- | -------------------------------------------------------- |
| `OLLAMA_HOST`     | `http://127.0.0.1:11434`    | Ollama image-generation API                              |
| `FLUX_MODEL`      | `x/flux2-klein:9b`          | Default image model                                      |
| `PYTHON_VERSION`  | `3.12`                      | Python version used by the Open WebUI installer          |
| `OLLAMA_BASE_URL` | `http://127.0.0.1:11434`    | Open WebUI's Ollama API, configured in `open-webui/.env` |
| `DATA_DIR`        | `open-webui/data`           | Open WebUI data directory                                |
| `HOST` / `PORT`   | App-specific defaults above | Web server address                                       |

Startup scripts invoke the app's Python executable directly and set `VIRTUAL_ENV` / `PATH`, avoiding old absolute paths in activation scripts. Other commands under a migrated `.venv/bin/` may still contain old paths; recreate that environment at its new location if you need to invoke those commands directly.
