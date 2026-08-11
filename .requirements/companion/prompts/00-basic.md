# 企业级的 AI 电子伴侣项目需求

## 前言

我想开发一个企业级的 AI 电子伴侣项目。

在我的设想里，它是一个包含了后台管理系统、前端展示应用的 monorepo 项目。

它应该包含了后台管理 RBAC 模块 + 前端用户模块 + 核心 AI 伴侣模块。

## 技术栈说明

### 基础技术栈

我希望基础技术栈是：

> - 尽量都用最新版

- Pnpm
- Turbo
- Monorepo

我希望统一的配置上：

- Typescript
- Prettier
- Commitlint
- Eslint
- Catalog

### 核心 AI 伴侣模块

具体可以查看 [AI 电子伴侣核心服务模块需求](./01-ai-companion-requirement.md)

### 后台管理 RBAC 模块

这部分方案还没做，但是我需要的就是一个标准的 RBAC 服务操作。

### 前端用户模块

这部分方案还没做，但是我需要的就是一个前端渲染功能。

## 开发工具

- Cursor
- Codex
- Claude

## AI 辅助工具

- `.agents/skills/` 下的 code-review、code-review-followup、git-commit skills

## 辅助说明

- 文档与注释都要使用中文
