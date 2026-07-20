# V1.3 Stage 03：Story Workbench 与 Release Closure

## 目标

完成 Story Mode 从「开发能力」到「可验证产品闭环」的最后阶段。

本阶段不追求完整低代码创作平台，而是建立一个可以验证以下流程的 Story Workbench：

```txt
创建/加载 Story Definition
↓
创建 Story Session
↓
进入故事对话
↓
观察 Story State 变化
↓
刷新后恢复故事
↓
通过 Debug 信息定位剧情行为
```

核心目标：

> 证明 story-core 可以支撑不同类型故事运行，并且创作者配置、玩家体验、运行状态和调试能力形成完整闭环。

---

# 一、范围边界

## 本阶段包含

```txt
Story Workbench
Story Session UI
Story Runtime 调试面板
Story Definition 展示
Dynamic Attribute 展示
E2E 验证
文档收口
```

## 本阶段不包含

```txt
可视化剧情节点编辑器
完整低代码平台
故事市场
多人故事
复杂战斗系统
剧情分支图编辑
角色自主后台行动
```

原因：

V1.3 的核心目标是验证「状态驱动叙事」，而不是构建完整创作工具。

---

# 二、产品流程设计

## 创作者流程

V1.3 使用预定义 Story Definition 或 JSON 导入方式。

流程：

```txt
Story Definition
↓
校验 Schema
↓
创建 Story Session
↓
开始游玩
```

Story Definition 包含：

```txt
故事基础信息
玩家身份
角色定义
场景定义
Lore
Narrative Rules
Attribute Schema
```

动态字段由 Attribute Schema 驱动：

例如武侠故事：

```json
{
  "attributes": [
    {
      "key": "combatPower",
      "type": "number"
    },
    {
      "key": "sectStanding",
      "type": "enum"
    }
  ]
}
```

恋爱故事：

```json
{
  "attributes": [
    {
      "key": "trust",
      "type": "number"
    },
    {
      "key": "relationshipStage",
      "type": "enum"
    }
  ]
}
```

UI 不允许写死业务字段。

---

# 三、Story Workbench

## 页面结构

```txt
/stories
    故事列表

/stories/[storyId]
    Story Overview

/stories/[storyId]/sessions/[sessionId]
    Story Runtime
```

---

## Story Runtime 页面

布局：

```txt
+--------------------------------+
| Story Header                   |
| 当前章节 / 当前场景             |
+--------------------------------+
|                                |
|       Story Conversation        |
|                                |
+--------------------------------+
| User Composer                  |
+--------------------------------+
| State Sidebar                  |
| - Attributes                   |
| - Inventory                    |
| - Clues                        |
| - Relationships                |
+--------------------------------+
```

---

# 四、动态 Attribute UI

属性展示完全由 Schema 驱动。

禁止：

```tsx
<CombatPower />
<Sanity />
<Affection />
```

应该：

```tsx
<StoryAttributeRenderer
  schema={attributeDefinition}
  value={state.attributes[key]}
/>
```

支持：

```txt
number
boolean
string
enum
```

约束：

```txt
required
range
maxLength
enumValues
writable
```

这些规则必须与 story-core Validator 保持一致。

---

# 五、Debug Workbench

复用现有 Runtime Debug 思路，增加 Story Domain 信息。

展示：

```txt
Story Definition
Current Scene
Current State
Attributes
Recalled Lore
Story Planner Output
State Changes
Rejected Changes
Workflow Timeline
Model Runtime
```

重点用于回答：

```txt
为什么角色这样回复？
为什么剧情推进？
为什么属性发生变化？
为什么某个事件没有触发？
```

---

# 六、Streaming 与 UI Adapter

继续复用现有流式架构。

链路：

```txt
StoryWorkflow.stream()
↓
StoryWorkflowEvent
↓
Story Wire Event
↓
UI Adapter
↓
AI SDK UI Message
```

不要让 Story Mode 绕过现有 Runtime Streaming 体系。

原因：

```txt
统一调试
统一错误处理
统一客户端消费方式
```

---

# 七、持久化验证

必须验证：

## Session 恢复

```txt
开始故事
↓
产生状态变化
↓
退出
↓
重新进入
↓
恢复正确状态
```

## 多轮一致性

验证：

```txt
已获得物品不会消失
已触发事件不会重复触发
隐藏信息不会提前泄露
角色关系保持一致
```

---

# 八、Contract Test

至少包含两个 Story Definition：

## 雾港疑云

验证：

```txt
clueHeat
trust
suspicion
```

## 武侠测试故事

验证：

```txt
combatPower
sectStanding
```

目标：

证明：

```txt
同一个 Story Runtime
可以运行不同领域模型
```

而不是：

```txt
Story Runtime = 某一种游戏规则
```

---

# 九、Release Checklist

## 代码

```txt
story-core tests
workflow tests
state recovery tests
streaming tests
contract tests
```

## 文档

更新：

```txt
README
AGENTS.md
requirements/stages
requirements/prompts
```

## Demo

确认：

```txt
可以开始故事
可以连续聊天
可以恢复 Session
可以查看状态
可以定位问题
```

---

# 完成标准

V1.3 Stage 03 完成后：

用户可以：

```txt
选择故事
进入角色
自由输入行动
观察剧情推进
查看世界状态
退出后继续
```

开发者可以：

```txt
知道 Story 为什么这样运行
知道 State 为什么变化
知道 Lore 为什么被召回
知道错误发生在哪一步
```

最终证明：

> story-core 已经成为 ai-core 之上的独立互动叙事领域能力，而不是一个特殊 Prompt 或聊天模式。