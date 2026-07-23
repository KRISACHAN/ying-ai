# V1.3 Stage 03：Story Workbench 与 Release Closure 补丁说明

> 文件名：`03-story-workbench-and-release-closure-patch.md`
> 关联主文档：`03-story-workbench-and-release-closure.md`
> 补丁主题：补齐 Story Debug 恢复、幂等可观测、可用 JSON 导入、Snapshot 列表展示与 V1.3 文档收口

## 一、补丁背景

V1.3 Stage 03 已经完成 Story Workbench 主体闭环：

1. `/stories`、Story Session 列表与 Story Runtime 页面已经建立；
2. Story Runtime 默认接入真实 `ModelStoryPlanner` 与 `ModelStoryRenderer`；
3. Story Core Event → Wire Event → NDJSON → UI Adapter 链路已经建立；
4. Story Session、State、Turn、Message、Summary 已接入 `story-postgres`；
5. 页面可以恢复 messages / state / summary / revision / definitionVersion；
6. 侧栏已经按 `StoryDefinition.attributes` 与 `createStoryAttributeStorageKey()` 动态渲染；
7. 雾港疑云与最小武侠契约已经证明同一 Runtime 可以消费不同 Attribute Schema；
8. Story Core、Story Postgres、Demo Wire / UI Adapter、typecheck、lint、build 验证已经通过。

Stage 03 验收 follow-up 发现，当前实现仍有若干阻止严格标记 Done 的 release closure 缺口：

1. Debug 面板没有 Effective Context 与 Recent Messages；刷新后 Lore / Plan / Accepted Changes / Rejected Changes / Timeline 回到空状态；
2. Core / Postgres 已保证 `clientTurnId` 幂等，但 Wire 与 UI 无法明确区分首次提交和幂等重放；重放响应也没有稳定携带旧 assistant text；
3. Story Definition JSON 入口当前只做校验预览，校验通过的 Definition 不能进入故事列表、创建 Session 或游玩；
4. Session 列表使用当前种子 Definition 解析旧 Session 的场景标题，没有完全按 `definitionSnapshot` 展示；
5. `AGENTS.md`、根 `README.md` 与部分索引仍残留 V1.2 或“V1.3 stage 03”状态，尚未完成版本收口；
6. 现有验证脚本覆盖 Core / Postgres / Wire / Adapter，但没有覆盖 Debug hydration、导入后开档、Snapshot 列表展示和幂等 UI 可观测。

Stage 03 的既有架构判断不变。本补丁只补齐验收闭环，不重做 Story Domain、Planner / Renderer、事务提交或 Companion 主链路。

---

## 二、补丁目标

本补丁需要完成以下能力：

1. Debug Workbench 同时支持当前 live turn 与刷新后的 persisted turn 调试信息；
2. 补齐 Effective Context 与 Recent Messages 展示，并明确调试数据来源；
3. 重复 `clientTurnId` 返回既有 canonical turn，不调用模型、不推进 revision，并在 Wire / UI 中明确标记幂等重放；
4. JSON 校验通过后可注册为进程生命周期内可用 Story Definition，并可创建持久化 Session；
5. Session 列表从各 Session 的 `definitionSnapshot` 解析标题、版本和当前场景；
6. 完成 V1.3 根文档、AI 入口与 requirements 索引收口；
7. 为以上行为补充确定性契约验证与最小浏览器验收路径；
8. 保持 Story Core Event / Wire Event 分层、原子提交、Definition Snapshot 和 Attribute Schema 约束不变。

---

## 三、补丁修改范围

### 3.1 Debug Workbench 补齐 Effective Context 与刷新恢复

涉及：

```txt
apps/model-runtime-demo/app/story-runtime-workspace.tsx
apps/model-runtime-demo/app/lib/story-debug-repository.ts
apps/model-runtime-demo/app/api/story-sessions/[id]/route.ts
apps/model-runtime-demo/scripts/verify-story-ui-adapter.ts
```

修改范围：

1. `StoryDebugPanel` 新增 Effective Context 区域，至少展示：
   - Narrative Summary 是否存在及当前内容；
   - recent messages 及其 role / sequence；
   - recalled Lore ids、visibility 与 activation reason；
   - 当前 Definition version、State revision、current scene；
   - 调试信息来源：`live` 或 `persisted`。
2. 新增 Recent Messages 独立区域，避免只在聊天气泡中展示而无法核对 Provider 上下文。
3. live turn 继续以 Wire Events 为权威数据源：
   - `story:context-ready` → Effective Context；
   - `story:lore-recalled` → Recalled Lore；
   - `story:plan-completed` → Planner Output；
   - `story:state-prepared` → Accepted Changes；
   - `story:validation-failed` → Rejected Changes；
   - 完整 Wire Events → live Workflow Timeline。
4. 页面首次加载或刷新时，由 `StoryDebugRepository` 使用已持久化数据构造 persisted debug hydration：
   - latest committed turn 的 `plan`；
   - latest committed turn 的 `recalledLore`；
   - latest committed turn 的 state change / revision / clientTurnId / turnNumber；
   - 当前 summary、recent messages、state、definitionSnapshot 与 model runtime；
   - persisted timeline 只展示数据库能够证明的 committed lifecycle，不伪造不存在的精确 live event 时间。
5. persisted 与 live 数据必须明确区分；发送新回合后 live 数据覆盖 persisted latest-turn 展示，刷新后恢复为 persisted hydration。
6. 不把 Debug 数据写入 StoryState、Companion Memory 或 Story Definition。

完成后需要能够回答：

```txt
当前看到的是 live turn 还是 persisted turn？
这一回合使用了什么 summary 与 recent messages？
召回了哪些 Lore，visibility 与 activation reason 是什么？
Planner 输出了哪些 StateChange？
哪些 Change 被接受或拒绝？
当前 turnId / clientTurnId / revision 是什么？
```

### 3.2 补齐 clientTurnId 幂等重放的 Wire 与 UI 语义

涉及：

```txt
packages/story-core/src/abstractions/story-event.ts
packages/story-core/src/workflow/default-story-workflow.ts
packages/story-core/scripts/verify-story-workflow.ts
apps/model-runtime-demo/app/lib/story-stream-wire.ts
apps/model-runtime-demo/app/lib/story-stream-ui-adapter.ts
apps/model-runtime-demo/app/api/story-sessions/[id]/messages/route.ts
apps/model-runtime-demo/app/story-runtime-workspace.tsx
apps/model-runtime-demo/scripts/verify-story-stream-contract.ts
apps/model-runtime-demo/scripts/verify-story-ui-adapter.ts
```

修改范围：

1. 在不改变既有 `story:committed` / `story:finish` 终止顺序的前提下，为幂等命中增加明确、可序列化的标记，例如：
   - `idempotentReplay: true`；
   - canonical `turnId`、`turnNumber`、`stateRevision`；
   - canonical assistant text 或足以让 Route 取得该文本的稳定契约。
2. 首次提交与幂等重放必须可由 Wire Event 区分，不允许 UI 根据 revision 是否变化自行猜测。
3. 重复 `clientTurnId` 必须返回原 committed turn 的 canonical assistant text；不得返回空文本或生成第二份 assistant message。
4. 幂等重放不得再次调用：
   - Lore recall；
   - Planner；
   - Validator；
   - Renderer；
   - Summary update；
   - Turn commit。
5. 幂等重放不得推进 State revision，不得增加 Turn / Message 数量。
6. `StoryStreamUIAdapter` 在最终 metadata 中暴露 `idempotentReplay`，UI 显示“已提交回合重放”或等价状态，同时保持最终 terminal status 为成功。
7. 正常首次提交的现有 delta / committed / finish 行为保持兼容。

本补丁只补充幂等可观测信息，不改变 `sessionId + clientTurnId` 的数据库唯一约束与 Stage 02 原子提交语义。

### 3.3 JSON 导入从“校验预览”升级为“进程内可用 Definition”

涉及：

```txt
apps/model-runtime-demo/app/lib/story-runtime-factory.ts
apps/model-runtime-demo/app/lib/story-debug-repository.ts
apps/model-runtime-demo/app/api/stories/import/route.ts
apps/model-runtime-demo/app/stories/story-actions.tsx
apps/model-runtime-demo/app/stories/page.tsx
apps/model-runtime-demo/scripts/verify-story-definition-import.ts（新增，名称可微调）
```

修改范围：

1. JSON 仍先通过 `validateStoryDefinition()`，验证失败不得注册。
2. 验证通过后，将 Definition 注册到 Demo 的进程生命周期 Story Registry，使其可以：
   - 出现在 `/stories`；
   - 打开 Definition Preview；
   - 创建 Story Session；
   - 使用真实 Story Runtime 游玩。
3. 注册成功的响应明确返回：
   - `storyId`；
   - `definitionVersion`；
   - `registered: true`；
   - `lifetime: "process"` 或等价字段；
   - Definition Preview。
4. UI 必须明确提示：
   - 导入 Definition 只在当前 Demo 进程生命周期内注册；
   - 创建 Session 后，完整 Definition 会冻结进 `definitionSnapshot`；
   - 重启后 Registry 中的临时 Definition 消失，但已创建 Session 的 snapshot 不被改写。
5. 相同 id / version 的重复导入必须幂等；相同 id 但内容或 version 冲突时返回结构化冲突错误，不静默覆盖当前可用 Definition。
6. 本补丁不新增完整 Story Definition 数据库、不实现市场或发布系统，也不支持热更新旧 Session。

### 3.4 Session 列表按 definitionSnapshot 展示

涉及：

```txt
apps/model-runtime-demo/app/lib/story-debug-repository.ts
apps/model-runtime-demo/app/stories/[storyId]/sessions/page.tsx
packages/story-postgres/src/serializers/story-definition-serializer.ts（仅在需要复用反序列化时）
apps/model-runtime-demo/scripts/verify-story-session-list.ts（新增，名称可微调）
```

修改范围：

1. `StorySessionListItem` 增加从 Session snapshot 得到的展示字段：
   - story title；
   - definition version；
   - current scene title；
   - state revision。
2. `listSessions(storyId)` 查询并反序列化各 Session 的 `definition_snapshot`，不得使用当前 seed Definition 解释旧 Session 的场景标题。
3. 当前 seed 已升级、导入 Definition 已从进程 Registry 消失、或旧 snapshot 使用不同 scene id 时，列表仍应显示 snapshot 中的正确标题。
4. Story Runtime 页面继续以 `session.definitionSnapshot` 为唯一 Definition 来源，现有语义不变。
5. 不对旧 Session 执行 Definition migration，不覆盖 snapshot。

### 3.5 V1.3 文档与版本状态收口

涉及：

```txt
AGENTS.md
README.md
.requirements/README.md
.requirements/prompts/06-v1.3-story-mode-plan.md（仅同步状态与索引，不重写历史方案）
apps/model-runtime-demo/README.md
packages/story-core/README.md
packages/story-postgres/README.md
```

修改范围：

1. `AGENTS.md`：
   - Project Snapshot 将 Story Core / Story Postgres / Debug app 标记为 V1.3 complete；
   - Current package 增加 V1.3 stages、roadmap 与完成状态；
   - Stage 03 链接指向真实 stage 文件与 patch 文件。
2. 根 `README.md`：
   - Current milestone 增加 V1.3；
   - Architecture 增加 `story-core`、`story-postgres` 与 Story Workbench；
   - Repository layout 与 Package READMEs 增加 Story 包；
   - Roadmap 增加 V1.3 三阶段；
   - Debug Workbench 运行入口增加 `/stories`；
   - 限制章节调整为当前版本边界，不再只写 V1.2。
3. `.requirements/README.md`：
   - Stage 03 目录中登记本 patch；
   - Quick Lookup 增加 V1.3 roadmap 与 stage 入口。
4. `apps/model-runtime-demo/README.md`：
   - 补充 persisted / live Debug 区分；
   - 补充幂等重放 UI 语义；
   - 补充进程内 JSON Definition Registry 生命周期；
   - 补充新增 verify 命令与手工验收步骤。
5. package README 只同步公共契约变化，不写 Demo 专属 UI 细节。

### 3.6 验证与验收闭环

涉及：

```txt
packages/story-core/scripts/verify-story-workflow.ts
packages/story-postgres/scripts/verify-story-postgres.ts
packages/story-postgres/scripts/verify-story-recovery.ts
apps/model-runtime-demo/scripts/verify-story-stream-contract.ts
apps/model-runtime-demo/scripts/verify-story-ui-adapter.ts
apps/model-runtime-demo/scripts/verify-story-workbench-planner.ts
apps/model-runtime-demo/scripts/verify-story-definition-import.ts（新增，名称可微调）
apps/model-runtime-demo/scripts/verify-story-session-list.ts（新增，名称可微调）
apps/model-runtime-demo/package.json
```

至少补充以下确定性场景：

1. 幂等重放返回 canonical assistant text、turnId 与 stateRevision；
2. 幂等重放有明确 Wire / UI metadata，且无第二次模型调用与 revision 推进；
3. persisted debug hydration 能恢复 latest Plan、Lore、accepted changes、clientTurnId 与 committed revision；
4. live debug 能展示 context-ready、Plan、Lore、accepted / rejected changes 与完整 timeline；
5. JSON Definition 校验通过后出现在 Registry，并可创建 Session；
6. 非法 Definition 与冲突 Definition 不进入 Registry；
7. Session 列表使用 snapshot scene title，不受当前 seed 变化影响；
8. 雾港与武侠两套 Schema 的 sidebar 行为不回归；
9. Wire guard、finish 后额外事件、validation-failed 与 error 行为不回归。

---

## 四、职责边界

### 本补丁负责

1. 补齐 Stage 03 原规格已经要求、但当前实现尚未完全满足的 Debug、幂等、导入、Snapshot 展示与文档门禁；
2. 对必要的 Story Core Event 增加向后兼容的幂等可观测字段；
3. 复用现有 Story Turn / Message / Summary / Snapshot 数据恢复 Debug 信息；
4. 让 JSON Definition 在 Demo 进程内真正可创建 Session；
5. 增加针对 release closure 缺口的自动化验证与手工验收说明。

### 本补丁不负责

1. 不重写 Stage 01 / Stage 02 Story Domain、Lore 或 Postgres 架构；
2. 不改变 StoryState revision、事务提交点、failed turn retry 或 Summary 降级语义；
3. 不把 Story 合并进 `SimpleChatWorkflow` 或 Companion Workbench；
4. 不把 Story State 写入 Companion Memory；
5. 不实现完整 Story Definition 数据库、编辑器、版本发布、市场或热更新；
6. 不实现多人故事、复杂战斗、节点画布、骰子或成长树；
7. 不新增 auth、RBAC、配额、生产部署或多租户能力；
8. 不要求持久化每个 live Wire Event 的精确时间；若数据库无法证明，应以 persisted lifecycle 明确标注而不是伪造；
9. 不修改已冻结 Session 的 `definitionSnapshot`。

---

## 五、预计修改文件范围

核心契约：

```txt
packages/story-core/src/abstractions/story-event.ts
packages/story-core/src/workflow/default-story-workflow.ts
packages/story-core/scripts/verify-story-workflow.ts
packages/story-core/README.md
```

持久化读取与验证：

```txt
packages/story-postgres/src/serializers/story-definition-serializer.ts（按需要）
packages/story-postgres/scripts/verify-story-postgres.ts（按需要扩展）
packages/story-postgres/scripts/verify-story-recovery.ts（按需要扩展）
packages/story-postgres/README.md
```

Demo Runtime / API / UI：

```txt
apps/model-runtime-demo/app/lib/story-runtime-factory.ts
apps/model-runtime-demo/app/lib/story-debug-repository.ts
apps/model-runtime-demo/app/lib/story-stream-wire.ts
apps/model-runtime-demo/app/lib/story-stream-ui-adapter.ts
apps/model-runtime-demo/app/api/stories/import/route.ts
apps/model-runtime-demo/app/api/story-sessions/[id]/route.ts
apps/model-runtime-demo/app/api/story-sessions/[id]/messages/route.ts
apps/model-runtime-demo/app/stories/page.tsx
apps/model-runtime-demo/app/stories/story-actions.tsx
apps/model-runtime-demo/app/stories/[storyId]/sessions/page.tsx
apps/model-runtime-demo/app/story-runtime-workspace.tsx
```

验证与文档：

```txt
apps/model-runtime-demo/scripts/verify-story-stream-contract.ts
apps/model-runtime-demo/scripts/verify-story-ui-adapter.ts
apps/model-runtime-demo/scripts/verify-story-workbench-planner.ts
apps/model-runtime-demo/scripts/verify-story-definition-import.ts（新增，名称可微调）
apps/model-runtime-demo/scripts/verify-story-session-list.ts（新增，名称可微调）
apps/model-runtime-demo/package.json
apps/model-runtime-demo/README.md
AGENTS.md
README.md
.requirements/README.md
.requirements/prompts/06-v1.3-story-mode-plan.md
```

预计不需要新增 Story 业务表。若实施时发现现有 `story_turns` 无法提供主文档要求的 persisted Debug 证据，应先在本 patch 中补充数据保留决策，再引入 migration；不得由 UI 静默伪造历史事件。

---

## 六、补丁后的完成标准

补丁完成后必须同时满足：

- Debug 面板展示 Effective Context、Recent Messages、Lore、Plan、Accepted / Rejected Changes、Timeline 与 Runtime；
- 页面刷新后 latest committed turn 的 Plan / Lore / changes / clientTurnId / revision 可恢复；
- persisted 与 live Debug 数据来源清晰，不把重建数据伪装成精确 live event；
- 重复 `clientTurnId` 不调用模型、不推进 revision、不新增 Turn / Message；
- 重复 `clientTurnId` 返回 canonical assistant text，并在 Wire / UI 中明确显示幂等重放；
- JSON Definition 校验通过后可进入当前进程 Registry、出现在 `/stories` 并创建 Session；
- JSON Definition 的 process lifetime 与 Session snapshot 语义在 UI / README 中说明；
- Session 列表使用各自 `definitionSnapshot` 展示 story / scene / version；
- 当前 seed 升级或临时 Definition 消失不影响已创建 Session 的 Runtime 恢复；
- 根 README、AGENTS、requirements 索引与 package README 统一标记 V1.3 状态；
- 既有 Story Core / Postgres / Wire / Adapter 验证继续通过；
- 新增 Debug hydration、import、snapshot list、idempotent replay 验证通过；
- 全仓 typecheck / lint / build / format check 通过；
- Companion Workbench 与 V1.2 Web Search 行为不回归。

---

## 七、验证方式

核心与数据库验证：

```bash
pnpm --filter @ying-companion/story-core verify:story-contract
pnpm --filter @ying-companion/story-core verify:story-workflow
pnpm --filter @ying-companion/story-postgres verify:story-postgres
pnpm --filter @ying-companion/story-postgres verify:story-recovery
```

Demo 契约验证：

```bash
pnpm --filter @ying-companion/model-runtime-demo verify:story-stream-contract
pnpm --filter @ying-companion/model-runtime-demo verify:story-ui-adapter
pnpm --filter @ying-companion/model-runtime-demo verify:story-workbench-planner
pnpm --filter @ying-companion/model-runtime-demo verify:story-definition-import
pnpm --filter @ying-companion/model-runtime-demo verify:story-session-list
```

工程验证：

```bash
pnpm typecheck
pnpm lint
pnpm build
pnpm format:check
```

最小浏览器验收：

```txt
A. /stories 同时显示两个 seed，并可导入第三个临时 Definition
B. 导入后的 Definition 可进入 sessions 页并创建 Session
C. 雾港与武侠侧栏分别显示自己的 Schema 字段，不互相泄漏
D. 发送一个真实模型回合后，live Debug 显示 Context / Lore / Plan / Timeline / committed revision
E. 刷新同一 Session 后，messages / state / summary / definitionVersion 与 persisted Debug 恢复
F. 以相同 clientTurnId 重放请求，页面显示幂等命中，回复文本与原回合一致，revision 不变
G. 打开旧 definitionVersion Session，列表与 Runtime 均显示 snapshot 中的场景标题
H. 返回 `/`，Companion Workbench 仍可进入且既有功能不受影响
```

---

## 八、建议实施顺序

```txt
1. 先定义幂等重放的 Core Event / Wire / UI metadata 契约并补失败测试
2. 补 Route canonical replay output，证明相同 clientTurnId 不产生第二次模型调用
3. 扩展 StoryDebugRepository 与 Session Detail，建立 persisted debug hydration
4. 补 Story Runtime Effective Context / Recent Messages / live-persisted source UI
5. 建立 Demo 进程内 Story Registry，打通 JSON import → list → create session
6. 修正 Session list 的 definitionSnapshot 展示来源
7. 扩展 verify 脚本并执行 Postgres / Browser 验收
8. 最后同步 AGENTS、README、requirements 与 package README，标记 V1.3 complete
```

该顺序优先固定契约与恢复证据，再改页面和文档，避免 UI 先行后再次修改 Wire / Repository 类型。

---

## 九、后续版本衔接

1. 持久化 Story Definition Catalog、版本发布与热更新继续留给 V1.3 之后；
2. 完整创作台应继续由 `StoryDefinition.attributes` 与领域目录驱动，不为具体游戏字段写死控件；
3. 若未来需要跨进程保存完整 Workflow Timeline，应单独设计可裁剪、可脱敏的 trace / debug persistence，不直接序列化 Core `raw` / `Error`；
4. 产品 API 接入 Story Mode 时，应由服务端持有 canonical `clientTurnId`、Session 权限与请求重试策略；
5. V1.3 完成后再评估 Story / Companion 是否有足够稳定的共享原语可上提到独立 runtime 层。
