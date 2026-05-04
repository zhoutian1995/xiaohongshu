# 小红书对标分析 (XHS Benchmark Agent)

## What This Is

AI 驱动的小红书同城对标账号分析与内容生成工具。商家输入门店信息（行业、城市、客群），系统通过自主 Agent 搜索、发现、分析同城同行账号，拆解其内容策略和脚本框架，最终生成可直接执行的小红书内容方案。

面向本地生活服务商家（美业、健身、餐饮等），解决"不知道怎么发小红书"的问题。

## Core Value

**Agent 能端到端跑通一次完整的对标分析流程，输出可执行的内容策略。** 如果这个跑不通，其他都不重要。

## Requirements

### Validated

- ✓ Next.js 15 Web 应用基础框架 — 已搭建
- ✓ SQLite 数据层（jobs、artifacts、tool_calls、timeline） — 已实现
- ✓ Agent 沙盒架构（Worker 轮询 → 子进程隔离 → Agent 自主执行） — 已实现
- ✓ Agent 工具注册（8 个工具定义 + OpenAI function calling 格式） — 已实现
- ✓ SSE 实时进度推送 — 已实现
- ✓ Zhipu GLM API 集成（OpenAI SDK 兼容） — 已实现
- ✓ CI/CD 自动部署到阿里云 — 已运行
- ✓ 三状态前端页面（idle/running/completed） — 基础版已实现

### Active

- [ ] 前端按参考页面重新设计（暖色纸质风格、终端预览、5 步工作流、左右分栏）
- [ ] Agent Runner 添加 CLI 入口点，让沙盒 spawn 能真正执行
- [ ] xhs-mcp 集成，实现实际小红书数据采集
- [ ] API 输入验证（Zod schema）
- [ ] 端到端测试：创建任务 → Agent 执行 → 结果写入 DB → 前端展示
- [ ] 运行进度页面（Agent Timeline）配合新设计风格
- [ ] 结果展示页面配合新设计风格（账号分析、脚本拆解、内容策略）

### Out of Scope

- 用户认证系统 — MVP 无需，任务通过 UUID 访问
- 多用户/多租户 — 当前单用户工具
- 付费/订阅 — 后续商业化时再加
- 移动端适配 — 先做桌面端
- 国际化 — 只服务中文市场

## Context

**当前状态：** 项目已部署到阿里云（cos.willeai.cn），前端和后端基础架构就位，但 Agent 无法真正执行（缺 CLI 入口点），数据采集未接入 xhs-mcp，前端是基础版需按参考设计重做。

**技术环境：**
- 前端：Next.js 15 App Router + Tailwind CSS + React
- 后端：Agent 架构（Zhipu GLM API + OpenAI SDK 兼容模式）
- 数据层：better-sqlite3
- 部署：GitHub Actions CI/CD → rsync → 阿里云 + pm2
- 域名：cos.willeai.cn（已配置 SSL）

**已知问题（来自代码库映射）：**
- Agent Runner 无 CLI 入口 → 沙盒 spawn 后空跑退出
- 零测试覆盖
- 无 API 输入验证
- Claude SDK 和 Zhipu SDK 双 LLM 提供者并存（需统一）
- data/ 目录未加入 .gitignore

**前端参考设计：** `/Users/wille/Desktop/xiaohongshu_benchmark.html`
- 暖色纸质风格（cream 背景、terracotta accent、ink 深色）
- 终端预览区 + 5 步工作流指示器
- 左右分栏布局（sticky 预览面板 + 表单卡片）
- 硬件阴影（box-shadow offset）、圆润按钮、chip 选择器

## Constraints

- **服务器资源：** 阿里云 2GB RAM，无法在服务器上执行 npm install/build，CI 必须在 GitHub Actions 上构建
- **LLM 提供者：** 使用 Zhipu GLM API（glm-5-turbo），OpenAI SDK 兼容模式
- **中国网络：** 不能依赖 Google Fonts、海外 CDN
- **数据库：** SQLite 单文件，无分布式需求
- **无用户系统：** MVP 阶段通过 job UUID 匿名访问

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Zhipu GLM API 替代 Claude API | 中国网络环境 + 成本考虑 | ✓ 已完成 |
| 子进程沙盒（非 Docker） | 2GB 服务器跑不了 Docker | — 待验证 |
| CI 构建 + rsync 部署 | 服务器 OOM 风险 | ✓ 已完成 |
| xhs-mcp 作为数据采集工具 | 小红书数据需要浏览器模拟 | — 待集成 |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-05-04 after initialization*
