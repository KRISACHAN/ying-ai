# V1.1 本地验收环境模板

> 复制本模板填写 `manual-verification.md` 时使用的环境信息。**不要**写入 API key 或完整 connection string 中的密码。

## 基本信息

| 项         | 值                                                               |
| ---------- | ---------------------------------------------------------------- |
| 验收日期   | YYYY-MM-DD                                                       |
| Commit SHA | `25cbcda6ebd9d07ed98a5239a3fbeab6bf2a49f4`（短 hash：`25cbcda`） |
| 操作系统   | e.g. macOS 26.x                                                  |
| Node.js    | `node -v`                                                        |
| pnpm       | `pnpm -v`                                                        |

## 服务依赖

| 服务                   | 版本 / 说明                             | 是否使用 |
| ---------------------- | --------------------------------------- | -------- |
| PostgreSQL             | e.g. 16 + pgvector                      | 是 / 否  |
| Ollama                 | e.g. 0.x, host `http://127.0.0.1:11434` | 是 / 否  |
| OpenAI-compatible 网关 | base URL（不含 key）                    | 是 / 否  |

## Demo 配置（非敏感）

```txt
OPENAI_MODEL=
OPENAI_BASE_URL=
OPENAI_FALLBACK_MODEL=        # 可选
DATABASE_URL=                 # 可写 postgresql://localhost:5432/... 不含密码或使用本地 trust
OLLAMA_MODEL=                 # 场景 C 使用
```

## Provider 矩阵

| 场景 | Provider          | 模型               | toolCalling 声明 |
| ---- | ----------------- | ------------------ | ---------------- |
| B    | openai-compatible |                    |                  |
| C    | ollama            |                    | false（默认）    |
| D    | openai-compatible |                    | true（若测工具） |
| E    | openai-compatible | primary + fallback | 按场景配置       |

## 命令记录

```bash
pnpm typecheck
pnpm lint
pnpm build
pnpm --filter @ying-companion/model-ollama verify:adapter
pnpm --filter @ying-companion/model-runtime-demo verify:stream-contract
```
