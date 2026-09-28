# Ollama Script

[English](README.md) | **简体中文**

Ollama / Open WebUI / ComfyUI 本地工作流脚本集合。

原 `ying-ollama-script` 已迁入 `ying-ai/apps/ollama-script`，workspace 包名为 `@ying-ai/ollama-script`。

本应用只包含脚本与配置；`prompts/`、`images/`、`open-webui/`、`comfyui/`、`archive/` 等目录为本地数据，已在 `.gitignore` 中忽略，不会提交到 Git。

## 目录结构

**应用内（git 跟踪）**

```
.
├── ai-script/           # Open WebUI / ComfyUI shell 脚本
│   ├── ow-install.sh
│   ├── ow-start.sh
│   ├── ow-uninstall.sh
│   └── comfy-start.sh
├── script/              # 生图 JS 脚本（type: module）
│   ├── flux.js          # 交互式生图（radio + checkbox + 文件名输入）
│   ├── flux-run.js      # 命令行直跑
│   └── lib/
└── package.json         # pnpm 快捷命令
```

**本地目录（.gitignore，需自行创建或由脚本生成）**

```
.
├── prompts/             # 生图 prompt，自行创建
├── images/              # 参考图，自行创建
├── open-webui/          # Open WebUI 安装目录（ow-install.sh 生成）
├── comfyui/             # ComfyUI 安装目录
├── archive/             # 本地归档
└── results/             # 生图输出（时间戳命名）
```

## 首次准备

在 `ying-ai` 根目录安装 workspace 依赖，再进入应用目录创建生图所需的本地目录，并放入自己的 prompt 与参考图：

```bash
pnpm install
cd apps/ollama-script
mkdir -p prompts images results
# 示例：创建 prompts/image.md，按需放入 images/*.jpg
```

Open WebUI 的安装目录由 `ow-install.sh` 创建。ComfyUI 需自行准备 `comfyui/ComfyUI/` 源码和 `comfyui/.venv/` Python 环境，再运行启动脚本。

所有数据目录均相对于应用目录解析，与终端当前目录无关。本次本地迁移已将原有数据移入此处。本地运行环境和数据不纳入 Git；新的 checkout 需要自行准备本地数据。

## 前置依赖

| 工具                                  | 用途                   | 安装                                               |
| ------------------------------------- | ---------------------- | -------------------------------------------------- |
| [Ollama](https://ollama.com)          | 本地模型推理 / 生图    | `brew install ollama`                              |
| [uv](https://github.com/astral-sh/uv) | Open WebUI Python 环境 | `curl -LsSf https://astral.sh/uv/install.sh \| sh` |
| Python 3.12                           | Open WebUI 运行环境    | `brew install python@3.12`                         |

下载模型较慢时，可先开代理再安装：

```bash
proxy
./ai-script/ow-install.sh 0.10.2
noproxy
```

## pnpm 快捷命令

以下工作流命令在 `ying-ai` 根目录和 `apps/ollama-script` 内均可直接执行；参数会传递给对应的应用脚本，例如：

```bash
pnpm flux
pnpm ow:start
pnpm flux:run --help
pnpm --filter @ying-ai/ollama-script lint
```

本应用直接执行 JavaScript 和 shell 脚本，没有 `build` 或 `dev` 任务，不出现在根目录的开发/构建选择器中。

```bash
pnpm ow:install          # 安装 Open WebUI
pnpm ow:start            # 启动 Open WebUI
pnpm ow:uninstall        # 卸载 Open WebUI
pnpm comfy:start         # 启动 ComfyUI
pnpm flux                # 交互选择 prompt（radio）+ 参考图（checkbox）
pnpm flux:run            # 直接用 prompts/image.md 生图
pnpm flux:loop           # 交互式循环生图
```

---

## Open WebUI

基于 Ollama 的 Web 聊天界面，默认端口 **8080**。

### 安装

```bash
./ai-script/ow-install.sh
./ai-script/ow-install.sh 0.10.2
./ai-script/ow-install.sh --force
```

### 启动

```bash
./ai-script/ow-start.sh
```

等到终端出现 `Ready: http://localhost:8080` 再打开浏览器。首次启动约需 **2–5 分钟**。

### 更新

```bash
./ai-script/ow-install.sh 0.10.2
./ai-script/ow-start.sh
```

若 Web 界面版本未变，浏览器 **强制刷新**（`Cmd+Shift+R`）。

### 卸载

```bash
./ai-script/ow-uninstall.sh
./ai-script/ow-uninstall.sh --backup
./ai-script/ow-uninstall.sh --keep-data
./ai-script/ow-uninstall.sh --venv-only
./ai-script/ow-uninstall.sh -y --backup
```

### 配置

配置文件：本地 `open-webui/.env`（安装 Open WebUI 后生成）

| 变量                   | 默认值                   | 说明             |
| ---------------------- | ------------------------ | ---------------- |
| `OLLAMA_BASE_URL`      | `http://127.0.0.1:11434` | Ollama API 地址  |
| `PORT`                 | `8080`                   | Web 端口         |
| `DEFAULT_MODEL_PARAMS` | `{"num_ctx":16384}`      | 全局默认模型参数 |

---

## ComfyUI

节点式工作流生图，默认端口 **8188**。

```bash
./ai-script/comfy-start.sh
# → http://localhost:8188
```

- 程序：本地 `comfyui/ComfyUI/`
- 模型：本地 `comfyui/ComfyUI/models/`

---

## Ollama 生图（flux2-klein）

```bash
ollama pull x/flux2-klein:9b
```

默认读取本地 `prompts/image.md`（需自行创建），输出保存到 `results/<时间戳>.png`。

### 交互式生图（推荐）

```bash
pnpm flux
```

- **Prompt**：radio 单选（本地 `prompts/` 目录）
- **参考图**：checkbox 多选，最多 2 张（本地 `images/` 目录，可不选）
- **输出名**：输入框，留空则使用时间戳（如 `20260715-100512.png`）

### 命令行直跑

```bash
pnpm flux:run
node script/flux-run.js prompts/image.md
node script/flux-run.js -o my-shot prompts/1.md
node script/flux-run.js -i images/ref.jpg -o test prompts/1.md
```

输出示例：`results/20260715-093812.png`

### 限制

- 图像生成目前仅 **macOS** 支持
- `x/flux2-klein:9b` 是生图模型，不能用于聊天
- 参考图编辑功能仍偏实验性

---

## Ollama 管理

```bash
brew update && brew upgrade ollama   # Homebrew 更新
ollama list
ollama pull <model>
ollama rm <model>
```

---

## 快速上手

```bash
pnpm install
cd apps/ollama-script
mkdir -p prompts images results
ollama pull x/flux2-klein:9b
./ai-script/ow-install.sh 0.10.2
./ai-script/ow-start.sh          # → http://localhost:8080
pnpm flux                        # → results/<timestamp>.png
./ai-script/comfy-start.sh       # → http://localhost:8188
```

---

## 常见问题

### Open WebUI 连接被拒绝

等到终端出现 `Ready: http://localhost:8080`（约 2–5 分钟）。

### 发 `hello` 报 context 超限

本地 `open-webui/.env` 中已设 `DEFAULT_MODEL_PARAMS={"num_ctx":16384}`，重启 `./ai-script/ow-start.sh`。

### 连续生图

用 `pnpm flux:loop`，每次可用 radio/checkbox 重新选择。

## 环境变量

- `OLLAMA_HOST`：生图 API 地址，默认 `http://127.0.0.1:11434`。
- `FLUX_MODEL`：生图模型，默认 `x/flux2-klein:9b`。
- `PYTHON_VERSION`：Open WebUI 安装脚本使用的 Python 版本，默认 `3.12`。
- Open WebUI 配置位于 `open-webui/.env`；ComfyUI 配置位于 `comfyui/.env`，默认端口分别为 `8080` 与 `8188`。

启动脚本直接调用本应用目录内的 Python，并设置 `VIRTUAL_ENV` / `PATH`，因此不依赖迁移前 activation 脚本中的绝对路径。直接运行 `.venv/bin/` 中的其他命令可能仍引用旧路径；如需使用这些命令，请在新位置重建对应虚拟环境。
