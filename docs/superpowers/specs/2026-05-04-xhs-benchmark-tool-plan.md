# 实施计划 v3.0：Web 控制台 + 后端沙盒 Agent 执行架构

## Context

设计文档 v3.0 已完成（`docs/superpowers/specs/2026-05-04-xhs-benchmark-tool-design.md`）。从 v2.1 的固定 Pipeline 架构切换为受控 Agent 架构。Step 1 已完成（Next.js 初始化），Step 2 需要重构。

## 环境前置条件

| 依赖 | 版本要求 | 说明 |
|------|---------|------|
| Node.js | ≥ 22 | Next.js 15 + 子进程管理 |
| Bun | latest | xhs-mcp 运行时 |
| Git | 任意 | 版本控制 |

### `.env.local` 必需字段

```env
ANTHROPIC_API_KEY=sk-ant-...
XHS_MCP_DATA_DIR=/Users/<user>/.xhs-mcp   # 绝对路径，实现时用 os.homedir() 展开
DATABASE_PATH=./data/xhs.db
```

### `package.json` scripts

```json
{
  "dev": "next dev",
  "worker": "tsx src/worker.ts",
  "test": "vitest",
  "lint": "eslint"
}
```

---

## Step 1：项目初始化 ✅ 已完成

Next.js 15 + TypeScript + Tailwind CSS + shadcn/ui + 核心依赖已安装。
`types.ts`、`claude.ts`、`xhs-client.ts` 已编写。

---

## Step 2：重构 — Agent Runtime + Scheduler + Sandbox

**目标：** Agent 沙盒执行系统可用

### 任务清单

- [ ] 重构 `src/lib/types.ts`：
  - 新增 `Job`（runStatus 替代 status + currentPhase）
  - 新增 `Artifact`（type + data + validationResult）
  - 新增 `ToolCall`（toolName + input + output + status + errorMessage + durationMs + budgetAfterCall）
  - 新增 `TimelineEvent`（type + message + data）
  - 新增 `Budget`（searchesUsed、profilesUsed、claudeTokensUsed 等）
  - 移除 `PhaseResult`、`currentPhase` 等旧 Pipeline 类型
- [ ] 重构 `src/lib/db.ts`：
  - `jobs` 表：runStatus、sandboxPid、budget_json、startedAt、completedAt
  - `artifacts` 表：type、data_json、validation_result、validation_errors、repair_attempt
  - `tool_calls` 表：tool_name、input_json、output_json、duration_ms
  - `timeline_events` 表：event_type、message、data_json
  - 移除 `benchmark_accounts` 表的固定字段，改为 artifact 存储
- [ ] 新建 `src/lib/sandbox-executor.ts`：
  - `spawnSandbox(jobId: string)` — 子进程启动 Agent Worker
  - 工作目录：`/tmp/xhs-agent/{jobId}/`
  - 超时控制：快速 8 分钟，深度 15 分钟
  - stdout/stderr → `{workDir}/agent.log`
  - 退出码：0=完成, 1=错误, 2=超时, 3=预算超限
- [ ] 新建 `src/lib/agent-runner.ts`：
  - Agent Runtime 抽象层
  - MVP 实现：Claude `messages.create` + `tools` 参数（Tool Use）
  - Agent System Prompt（来自 `prompts/agent-system.ts`）
  - Tool Use 循环：Agent 返回 tool_use → 执行工具 → 返回 tool_result → Agent 继续
  - Budget 守卫：每次 tool call 检查预算，超限则注入停止指令
  - 最多 50 轮 tool use 循环
- [ ] 新建 `src/lib/tool-registry.ts`：
  - 注册所有工具（xhs_search、xhs_user_profile、xhs_get_note、analyze_account、breakdown_scripts、generate_content、save_artifact、report_progress）
  - 每个工具定义：name、description、input_schema（JSON Schema）、handler
  - 调用计数和限流检查
  - input_schema 样例：
    ```typescript
    // xhs_search
    { type: 'object', properties: { keyword: { type: 'string' }, limit: { type: 'number', default: 20 } }, required: ['keyword'] }
    // save_artifact
    { type: 'object', properties: { type: { enum: ['benchmark_accounts','account_analysis','script_breakdown','content_strategy'] }, data: { type: 'object' } }, required: ['type','data'] }
    // report_progress
    { type: 'object', properties: { phase: { enum: ['searching','analyzing','generating','validating'] }, message: { type: 'string' } }, required: ['phase','message'] }
    ```
- [ ] 新建 `src/lib/tools/xhs.ts`：
  - 封装 xhs-mcp 调用为 Agent 工具格式
  - xhs_search_tool、xhs_user_profile_tool、xhs_get_note_tool
- [ ] 新建 `src/lib/tools/analysis.ts`：
  - analyze_account_tool（含账号分类 + 评分 + 证据绑定逻辑）
  - breakdown_scripts_tool（含爆款 vs 普通对比）
  - generate_content_tool
- [ ] 新建 `src/lib/tools/system.ts`：
  - save_artifact_tool — 保存产物到 DB
  - report_progress_tool — 写入 timeline_event 并触发 SSE
- [ ] 新建 `src/lib/artifact-validator.ts`：
  - `validateJobArtifacts(jobId: string): ValidationResult`（全局校验，不是单个 artifact）
  - 跨 artifact 检查：账号分析的 evidence 是否对应 benchmark_accounts 的 note，脚本的 referenceNotes 是否存在
  - 单 artifact 检查：对标账号数量、证据引用、脚本数量、拍摄清单
  - 失败返回具体错误信息，用于 Agent 修复
- [ ] 新建 `src/prompts/agent-system.ts`：
  - Agent System Prompt（从设计文档复制）
  - 包含门店问卷动态注入
- [ ] 重构 `src/worker.ts`（Agent Scheduler）：
  - 轮询 queued 任务
  - 调用 `sandbox-executor.spawnSandbox(jobId)`
  - 监控沙盒状态
  - 沙盒完成后运行 `validateJobArtifacts(jobId)`
  - 校验失败 → 不重新 spawn，把 validation errors + 当前 artifacts + cache 发给 Agent 继续修复（复用已有 tool_calls 和 cache）
  - 最多修复 1 次
  - 记录 budget 到 DB
- [ ] 重构 API Routes：
  - `POST /api/jobs` — 创建任务
  - `GET /api/jobs/[id]` — 查询任务状态 + artifacts + tool_calls
  - `GET /api/jobs/[id]/stream` — SSE 推送 timeline_events
- [ ] 移除旧文件：
  - `src/lib/job-runner.ts`
  - `src/lib/phases/` 目录
  - `src/lib/classifier.ts`（逻辑合并到 tools/analysis.ts）
  - `src/lib/scorer.ts`（逻辑合并到 tools/analysis.ts）
  - `src/prompts/classify-account.ts`、`analyze-account.ts`、`breakdown-script.ts`、`generate-script.ts`（合并到 agent-system.ts）

### 验证标准

- 创建任务 → Scheduler 启动沙盒 → Agent 执行 tool calls → 产物写入 DB → SSE 推送
- Agent 崩溃 → 主进程正常 → DB 记录 error
- 超过预算 → Agent 自动停止
- 产物校验失败 → 修复 1 次

---

## Step 3：Agent 工具实现

**目标：** 所有 Agent 工具可用，能端到端跑通

### 任务清单

- [ ] `src/lib/tools/xhs.ts` — xhs_search、xhs_user_profile、xhs_get_note
- [ ] `src/lib/tools/analysis.ts`：
  - analyze_account_tool：
    - 账号分类（规则预筛 + AI 精分，逻辑来自旧 classifier.ts）
    - 多维评分（逻辑来自旧 scorer.ts）
    - 证据型分析（Claude API 调用）
  - breakdown_scripts_tool：
    - 爆款 vs 普通对比（笔记按互动排序分组，< 6 篇跳过）
    - 差异因子提取
  - generate_content_tool：
    - 综合门店问卷 + 分析结果生成策略
    - 2 条可拍脚本（快速模式）
- [ ] `src/lib/tools/system.ts` — save_artifact、report_progress
- [ ] 验证：模拟 Agent 调用每个工具，确认输入输出格式正确

---

## Step 4：前端 Web 控制台

**目标：** Agent Timeline UI 可用

### 任务清单

- [ ] `src/app/page.tsx` — 主页面布局（左输入 + 右 Timeline）
- [ ] `src/components/StoreProfileForm.tsx` — 门店情况问卷表单
- [ ] `src/components/AgentTimeline.tsx` — Agent 事件时间线：
  - 4 个阶段标签：searching / analyzing / generating / validating
  - 实时事件流（SSE）
  - 每个 tool call 展示输入/输出摘要
- [ ] `src/components/ResultPanel.tsx` — 结果展示：
  - 对标账号卡片（含评分、分类、证据引用）
  - 脚本展示卡片（含拍摄清单、参考笔记）
- [ ] `src/components/EvidenceTag.tsx` — 证据引用标签
- [ ] `src/lib/mock-data.ts` — Mock 数据（Agent timeline 事件序列）
- [ ] SSE 客户端：`useJobStream(jobId)` hook

---

## Step 5：端到端测试 + 修复

**目标：** 快速模式闭环稳定可用

### 任务清单

- [ ] 用"深圳美甲"跑完整快速模式
- [ ] 检查 Agent 自主决策能力（是否合理选择工具和顺序）
- [ ] 检查对标准确率 ≥ 70%
- [ ] 检查产物校验通过率
- [ ] 检查 budget 守卫（超过预算时 Agent 是否停止）
- [ ] 检查沙盒隔离（Agent 崩溃后主进程正常）
- [ ] 纯函数单测（Vitest）：
  - `generateSearchKeywords()` — 关键词生成
  - `preFilterAccount()` — 账号分类
  - `calculateScore()` — 评分计算
  - `validateArtifact()` — 产物校验
  - `budgetGuard()` — 预算检查
  - SSE TimelineEvent 格式

---

## 项目结构总览

```
xiaohongshu/
├── src/
│   ├── app/
│   │   ├── page.tsx
│   │   ├── layout.tsx
│   │   └── api/
│   │       ├── jobs/route.ts
│   │       └── jobs/[id]/
│   │           ├── route.ts
│   │           └── stream/route.ts
│   ├── worker.ts                       # Agent Scheduler
│   ├── components/
│   │   ├── StoreProfileForm.tsx
│   │   ├── AgentTimeline.tsx
│   │   ├── ResultPanel.tsx
│   │   └── EvidenceTag.tsx
│   ├── lib/
│   │   ├── types.ts                    # 新数据模型
│   │   ├── db.ts                       # 新 schema
│   │   ├── agent-runner.ts             # Agent Runtime（Tool Use 循环）
│   │   ├── sandbox-executor.ts         # 沙盒管理
│   │   ├── tool-registry.ts            # 工具注册
│   │   ├── artifact-validator.ts       # 产物校验
│   │   ├── rate-limiter.ts
│   │   ├── cache.ts
│   │   ├── claude.ts                   # Claude API 封装
│   │   ├── xhs-client.ts              # xhs-mcp 封装
│   │   └── tools/
│   │       ├── xhs.ts                  # 搜索/资料/笔记工具
│   │       ├── analysis.ts             # 分析/拆解/生成工具
│   │       └── system.ts              # save_artifact/report_progress
│   ├── prompts/
│   │   └── agent-system.ts             # Agent System Prompt
│   └── __tests__/                      # 单测
├── docs/
│   └── superpowers/specs/
├── package.json
├── tailwind.config.ts
└── tsconfig.json
```

## 实施顺序

```
Step 1 ✅ 已完成
    ↓
Step 2（重构：Agent Runtime + Scheduler + Sandbox）
    ↓
Step 3（Agent 工具实现）
    ↓
Step 4（前端 UI）← 可与 Step 3 并行（用 mock 数据）
    ↓
Step 5（端到端测试）
```
