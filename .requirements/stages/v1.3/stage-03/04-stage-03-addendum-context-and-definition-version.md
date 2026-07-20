# V1.3 Stage 03 Addendum：Definition Version 与 Effective Context

## 1. StoryDefinition Schema Version

Story Definition 导入与存档冻结必须区分：

```txt
schemaVersion
  ↓
描述 StoryDefinition 数据结构版本

storyVersion
  ↓
描述具体故事内容版本
```

建议：

```json
{
  "schemaVersion": "1.0",
  "storyVersion": "1.0"
}
```

要求：

- JSON Import 时必须校验 schemaVersion
- Session 创建时保存 definitionVersion
- Session 恢复时继续使用 definitionSnapshot
- 后续 StoryDefinition 结构变化时，不直接影响旧 Session

V1.3 不实现 migration 系统，但必须保留未来迁移边界。

---

## 2. Effective Context Debug

Story Debug Workbench 增加 Effective Context 面板。

目标：回答：

> 这一次模型生成回复时，实际看到了什么？

展示：

```txt
System Instructions
Story Rules
Current Scene
Visible Character Facts
Recent Messages
Narrative Summary
Recalled Lore
Dynamic Attributes
```

事件映射：

```txt
story:context-ready
        ↓
Effective Context

story:lore-recalled
        ↓
Recalled Lore

story:plan-completed
        ↓
Planner Output

story:state-prepared
        ↓
Prepared Changes

story:committed
        ↓
Committed State Revision
```

约束：

- Debug 展示的信息必须来自 Runtime Event 或明确持久化数据
- 不允许前端自行猜测 Prompt 上下文
- 不改变 story-core 主流程，仅增加 Demo 侧观测能力
