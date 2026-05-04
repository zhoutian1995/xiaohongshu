# AI 对标账号分析与内容生成工具 — 设计文档 v3.0

## Context

本地生活商家（美业、餐饮、健身、医美等）想做小红书账号，但不知道怎么定位、怎么写内容。本工具将手动流程自动化：用户填写门店问卷，系统启动 AI Agent 在沙盒中自主完成对标账号发现、深度分析、脚本拆解和内容策略生成。

### 核心原则

- **证据驱动：** 每个分析结论都必须附带来源，不做无源结论
- **可执行优先：** 输出内容必须能直接指导拍摄和发布
- **合规边界：** 竞品内容仅用于分析学习，不直接复制他人的图片、视频、文案

## MVP 范围

输入：城市 + 行业 + 门店情况问卷
↓
Agent 自主规划并执行：发现对标 → 分析账号 → 拆解脚本 → 生成策略
↓
输出：3-5 个对标账号的**证据型拆解** + **首周 2 条可拍脚本** + **7 天启动计划** + **10 个选题池**

MVP 不做：30 天日历、完整策略报告、用户系统、数据导出、内容自动发布。

## 架构：Web 控制台 + 后端沙盒 Agent 执行

```
┌────────────────────────────────────────────────────────┐
│                  Frontend (Web 控制台)                    │
│  ┌──────────────┐  ┌──────────────────────────────┐    │
│  │ 门店情况问卷  │  │     Agent Timeline 进度面板     │    │
│  │ [提交任务]   │  │  🔍 searching → 📊 analyzing  │    │
│  │              │  │  → 📝 generating → ✅ validating│    │
│  └──────────────┘  └──────────────────────────────┘    │
└────────────────┬──────────────────────────────────────┘
                 │ REST API（创建/查询任务）+ SSE（实时进度）
┌────────────────┼──────────────────────────────────────┐
│            API Server (Next.js API Routes)               │
│  POST /api/jobs  → 创建任务，返回 jobId                  │
│  GET  /api/jobs/[id]  → 查询任务状态和结果                │
│  GET  /api/jobs/[id]/stream  → SSE 实时进度推送           │
└────────────────┬──────────────────────────────────────┘
                 │
┌────────────────┼──────────────────────────────────────┐
│           Agent Scheduler (独立 Worker 进程)              │
│  ┌──────────────────────────────────────────────────┐   │
│  │ 轮询 queued 任务 → 启动沙盒 → 监控状态 → 处理结果  │   │
│  └──────────────────────────────────────────────────┘   │
│                         ↓ spawn                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │          Sandbox Runtime (子进程隔离)               │   │
│  │  ┌────────────────────────────────────────────┐  │   │
│  │  │         Agent Worker (AI Agent)              │  │   │
│  │  │                                              │  │   │
│  │  │  System Prompt → 规划任务 → 调用工具 → 写产物  │  │   │
│  │  │                                              │  │   │
│  │  │  Tools:                                      │  │   │
│  │  │  ├── xhs_search      搜索小红书笔记           │  │   │
│  │  │  ├── xhs_user_profile 获取用户资料            │  │   │
│  │  │  ├── xhs_get_note    获取笔记详情             │  │   │
│  │  │  ├── analyze_account AI 分析账号（证据绑定）   │  │   │
│  │  │  ├── breakdown_scripts AI 拆解脚本            │  │   │
│  │  │  ├── generate_content AI 生成内容策略         │  │   │
│  │  │  ├── save_artifact   保存结构化产物           │  │   │
│  │  │  └── report_progress 报告当前进度             │  │   │
│  │  └────────────────────────────────────────────┘  │   │
│  └──────────────────────────────────────────────────┘   │
│                         ↓                                │
│  ┌──────────────────────────────────────────────────┐   │
│  │         Artifact Validator (产物校验)              │   │
│  │  检查：账号数量、证据引用、脚本数量、合规边界        │   │
│  │  失败 → 最多修复 1 次                              │   │
│  └──────────────────────────────────────────────────┘   │
└────────────────┬──────────────────────────────────────┘
                 │
┌────────────────┴──────────────────────────────────────┐
│                  Database (SQLite)                       │
│  jobs · artifacts · tool_calls · timeline_events · cache │
└─────────────────────────────────────────────────────────┘
```

### 核心组件

| 组件 | 职责 |
|------|------|
| **Agent Scheduler** | 独立 Worker 进程，轮询任务队列，为每个任务 spawn 沙盒子进程 |
| **Sandbox Executor** | 子进程隔离，管理 Agent Worker 的生命周期（启动、超时、异常退出） |
| **Agent Worker** | AI Agent（Claude Tool Use），根据 System Prompt 自主规划并调用工具 |
| **Tool Registry** | 注册 Agent 可调用的工具，定义输入/输出 schema、限流、调用预算 |
| **Artifact Validator** | 校验 Agent 产出的结构化 JSON，不通过则触发修复 |
| **Trace Store** | 记录每次 tool call、artifact checkpoint、sandbox 日志、budget 用量 |
| **Storage** | SQLite 存储任务状态、产物、时间线事件、缓存 |

### Agent 运行流程

```
1. create_job        用户提交任务 → DB 写入 job(status=queued)
2. spawn_sandbox     Scheduler 检测到任务 → 启动子进程 → Agent Worker 初始化
3. agent_plans       Agent 收到 System Prompt + 门店问卷 → 自主规划工具调用序列
4. agent_executes    Agent 按规划调用工具，每次 tool call 记录到 Trace Store
5. write_artifacts   Agent 调用 save_artifact 保存结构化产物到 DB
6. validate          Artifact Validator 检查产物完整性
7. repair (optional) 校验失败 → Agent 收到错误信息 → 修复 → 重新校验（最多 1 次）
8. complete          校验通过 → job(status=completed) → SSE 推送完成
   或 error          超时/崩溃/修复失败 → job(status=error) → SSE 推送错误
```

## 用户输入：结构化门店问卷

（与 v2.1 相同，保持不变）

```typescript
interface StoreProfile {
  industry: string
  city: string
  district?: string
  storeName: string
  priceRange: string
  targetAudience: string
  businessArea: string
  specialties: string[]
  realAdvantages: string[]
  filmableAssets: string[]
  onCamera: boolean
  onCameraInfo?: string
  postFrequency: string
  existingAccount?: string
  forbiddenTopics?: string[]
  conversionMethod: string
}
```

## Tool Registry

Agent 可调用的工具，每个工具有明确的输入/输出 schema、调用预算和限流：

### 数据采集工具

| 工具 | 输入 | 输出 | 预算 | 限流 |
|------|------|------|------|------|
| `xhs_search` | `{ keyword: string, limit?: number }` | `{ notes: SearchResult[] }` | 快速 ≤ 6 次，深度 ≤ 12 次 | ≥ 2s 间隔 |
| `xhs_user_profile` | `{ userId: string }` | `{ profile: UserProfile }` | 快速 ≤ 15 次，深度 ≤ 50 次 | ≥ 2s 间隔 |
| `xhs_get_note` | `{ noteId: string, xsecToken: string }` | `{ note: NoteDetail }` | 快速 ≤ 30 次，深度 ≤ 100 次 | ≥ 2s 间隔 |

### AI 分析工具

| 工具 | 输入 | 输出 | 预算 | 限流 |
|------|------|------|------|------|
| `analyze_account` | `{ profile, notes, storeProfile }` | `{ AccountAnalysis }` 证据绑定 | ≤ 10 次 | ≥ 1s 间隔 |
| `breakdown_scripts` | `{ hitNotes, avgNotes }` | `{ BreakdownResult }` | ≤ 10 次 | ≥ 1s 间隔 |
| `generate_content` | `{ storeProfile, accounts, breakdown, scriptCount }` | `{ ContentStrategy }` | ≤ 3 次 | ≥ 1s 间隔 |

### 系统工具

| 工具 | 输入 | 输出 | 说明 |
|------|------|------|------|
| `save_artifact` | `{ type: string, data: JSON }` | `{ artifactId }` | 保存结构化产物到 DB |
| `report_progress` | `{ phase: string, message: string }` | `{ ok }` | 向前端报告进度 |

### 工具调用预算（单任务上限）

| 维度 | 快速模式 | 深度模式 |
|------|---------|---------|
| xhs_search 调用 | ≤ 6 次 | ≤ 12 次 |
| xhs_user_profile 调用 | ≤ 15 次 | ≤ 50 次 |
| xhs_get_note 调用 | ≤ 30 次 | ≤ 100 次 |
| analyze_account 调用 | ≤ 10 次 | ≤ 15 次 |
| Claude tokens 总量 | ≤ 80K | ≤ 200K |
| 候选账号数 | ≤ 12 个 | ≤ 50 个 |
| 最终对标数 | 3 个 | 5 个 |
| 生成脚本数 | 2 条 | 3 条 |
| 总耗时上限 | 8 分钟 | 15 分钟 |

## Artifact Contract

Agent 最终必须产出的结构化 JSON：

### artifact: benchmark_accounts

```typescript
interface BenchmarkAccountArtifact {
  accounts: {
    userId: string
    nickname: string
    followers: number
    notesCount: number
    accountType: 'merchant' | 'influencer' | 'deal' | 'user' | 'brand'
    classificationMethod: 'rule' | 'ai'
    classificationEvidence: string
    score: BenchmarkScore
    notes: Note[]
  }[]
}
```

### artifact: account_analysis

```typescript
interface AccountAnalysisArtifact {
  accounts: {
    userId: string
    analysis: {
      positioning: string
      targetAudience: string
      differentiation: string
      contentTypes: ContentTypeDistribution[]
      postingFrequency: string
      hitPatterns: string[]
      evidenceList: AnalysisConclusion[]  // 每个结论必须带证据
    }
  }[]
}
```

### artifact: script_breakdown

```typescript
interface ScriptBreakdownArtifact {
  breakdowns: {
    userId: string
    hitPatterns: ScriptPattern[]
    averagePatterns: ScriptPattern[]
    differenceFactors: DifferenceFactor[]
    reusableTemplates: ScriptTemplate[]
  }[]
}
```

### artifact: content_strategy

```typescript
interface ContentStrategyArtifact {
  positioning: string
  positioningEvidence: EvidenceReference[]
  weekPlan: DayPlan[]
  topicPool: Topic[]
  scripts: ShootableScript[]
  tagLibrary: TagCategory[]
}
```

## Artifact Validator

Agent 保存产物后，自动校验：

| 检查项 | 规则 | 失败处理 |
|--------|------|---------|
| 对标账号数量 | ≥ 3 个 merchant 类型账号 | 触发修复：Agent 扩大搜索范围 |
| 证据引用 | 每个分析结论 ≥ 2 个证据 | 触发修复：Agent 补充证据 |
| 脚本数量 | ≥ 2 条可拍脚本 | 触发修复：Agent 补充脚本 |
| 拍摄清单 | 每条脚本有 shootingChecklist | 触发修复：Agent 补充 |
| 合规边界 | 无直接复制的竞品文案 | 触发修复：Agent 重写 |
| 参考笔记 | 每条脚本有 referenceNotes | 触发修复：Agent 补充 |

修复规则：校验失败 → 将 validation errors + 当前已有 artifacts 发给 Agent（不重新 spawn，复用已有 cache/tool_calls）→ Agent 只修复缺失/不合规的 artifact → 重新校验 → **最多修复 1 次** → 仍不通过则标记 error 并输出已有结果。

## Sandbox Model

> **注意：** child_process 是**故障隔离**（Agent 崩溃不影响主进程），不是安全隔离。真正的安全边界是 Tool White List（Agent 只能调用注册的工具）+ 预算限制 + 超时。child_process 无法防御任意代码执行风险——这在 MVP 阶段可接受，生产环境需升级为 Docker 容器或 VM 沙盒。

| 维度 | 设计 |
|------|------|
| 工作目录 | 每个任务独立目录：`/tmp/xhs-agent/{jobId}/` |
| 环境变量白名单 | `ANTHROPIC_API_KEY`、`XHS_MCP_DATA_DIR`、`DATABASE_PATH`、`JOB_ID` |
| 超时 | 快速模式 8 分钟，深度模式 15 分钟，超时自动 SIGTERM |
| 进程限制 | 单任务最多 2 个子进程（Agent + xhs-mcp） |
| 日志采集 | stdout/stderr 重定向到 `{workDir}/agent.log`，写入 DB |
| 退出码 | 0=正常完成，1=Agent 错误，2=超时，3=预算超限 |
| 内存 | 无硬限制（MVP 自己用），后续可加 cgroup |

## Agent System Prompt

```
你是一个小红书对标账号分析 Agent。

## 任务
根据用户提供的门店信息，自主完成以下目标：
1. 发现 3-5 个高质量同城商家对标账号
2. 深度分析账号定位、内容策略、脚本框架
3. 生成可执行的首周内容策略和脚本

## 可用工具
- xhs_search: 搜索小红书笔记（输入关键词，返回笔记列表）
- xhs_user_profile: 获取用户资料和笔记列表
- xhs_get_note: 获取笔记详情
- analyze_account: AI 深度分析账号（带证据绑定）
- breakdown_scripts: AI 拆解脚本框架（爆款 vs 普通对比）
- generate_content: AI 生成内容策略和脚本
- save_artifact: 保存结构化结果到数据库
- report_progress: 向前端报告当前进度

## 执行策略（参考顺序，可自主调整）
以下是一个典型执行顺序，**你可以根据实际情况调整**——比如搜索结果不够就多搜几次，某个账号分析失败就跳过，发现新的细分方向就深入挖掘。
1. 先用 xhs_search 搜索多个关键词组合，收集候选账号
2. 用 xhs_user_profile 获取候选账号详情
3. 先用硬规则预筛账号类型（简介含"预约/地址"→商家号，含"探店"→达人号）
4. 不确定的账号可以用 analyze_account 辅助判断
5. 筛选 merchant 类型，按评分排序取 Top 3-5
6. 对每个对标账号调用 analyze_account 做证据型分析
7. 调用 breakdown_scripts 做爆款 vs 普通对比拆解
8. 调用 generate_content 生成内容策略
9. 调用 save_artifact 保存所有结果
10. 调用 report_progress 报告完成

**约束：** 无论你如何调整顺序，最终必须满足 Artifact Contract（4 类产物齐全）和预算限制。自主性体现在策略选择，不是绕过约束。

## 账号分类规则
- 简介含"预约/地址/营业"→ merchant
- 简介含"探店/合作"→ influencer（排除）
- 机构名/品牌名 → brand（排除）
- 笔记反复出现同一门店 → merchant
- 笔记全是团购 → deal（排除）

## 评分权重（快速模式）
同城相关性 25% | 行业相关性 20% | 代理咨询密度 10% | 活跃度 25% | 爆款率 10% | 可学习性 10%

## 证据规则
- 每个分析结论必须引用来源（noteId + title + 数据指标）
- 只引用标题、指标、URL、摘要，不引用大段原文
- 脚本生成：学习结构，不复用表达

## 合规边界
- 不复制竞品的具体文案、标题、封面设计
- 脚本必须基于门店真实素材和条件
- 不生成门店无法执行的脚本

## 预算限制
- 搜索次数 ≤ 6，候选账号 ≤ 12，最终对标 3 个
- 每账号分析 10 篇笔记
- 生成 2 条可拍脚本
- 总耗时 ≤ 8 分钟
```

## 数据模型

```typescript
// 任务
interface Job {
  id: string
  storeProfile: StoreProfile
  mode: 'fast' | 'deep'
  runStatus: 'queued' | 'spawning' | 'running' | 'validating' | 'repairing' | 'completed' | 'error'
  sandboxPid?: number
  startedAt?: string
  completedAt?: string
  errorMessage?: string
  budget: {
    searchesUsed: number
    profilesUsed: number
    notesUsed: number
    claudeTokensUsed: number
    toolCallsTotal: number
    elapsedMs: number
  }
}

// 产物
interface Artifact {
  id: string
  jobId: string
  type: 'benchmark_accounts' | 'account_analysis' | 'script_breakdown' | 'content_strategy'
  data: string  // JSON string
  createdAt: string
  validationResult?: 'pass' | 'fail'
  validationErrors?: string[]
  repairAttempt?: number  // 0=首次, 1=修复后
}

// 工具调用记录
interface ToolCall {
  id: string
  jobId: string
  toolName: string
  input: string   // JSON
  output: string   // JSON
  status: 'success' | 'error' | 'budget_exceeded'
  errorMessage?: string
  durationMs: number
  budgetAfterCall: {    // 调用后的预算快照
    searchesUsed: number
    profilesUsed: number
    notesUsed: number
    claudeTokensUsed: number
  }
  createdAt: string
}

// 时间线事件（SSE 推送）
interface TimelineEvent {
  id: string
  jobId: string
  type: 'job_started' | 'tool_called' | 'tool_completed' | 'artifact_saved' | 'validation_passed' | 'validation_failed' | 'repair_started' | 'job_completed' | 'job_error'
  message: string
  data?: string  // JSON
  createdAt: string
}
```

## 数据采集方案：xhs-mcp

（与 v2.1 相同，保持不变。xhs-mcp 作为 Agent 工具的后端实现，Agent 通过 `xhs_search`、`xhs_user_profile`、`xhs_get_note` 工具调用它。）

风险控制措施不变：使用小号、请求间隔 ≥ 2s、MVP 不下载图片/视频。

## Future Spike: Obscura Browser Backend

Obscura 是一个轻量 headless browser / CDP server 候选，可作为后续浏览器后端优化实验项。它的价值不在于替代 Agent/Sandbox 架构，而是验证是否能用更轻的本地 CDP 后端承载 Playwright 或 xhs-mcp 的浏览器访问。

**v1 不接入 Obscura。** 当前 Phase 1-5 仍以 Agent Core、xhs-mcp 数据采集、Agent Pipeline、Frontend、E2E 稳定性为主线。Obscura 不解决当前 Phase 1-3 blocker：CLI 入口点、JSON 安全、SQL 注入、环境变量白名单、xhs-mcp 工具集成和 Agent 预算/验证流程仍必须按现有路线完成。

### 可借鉴点

- 进程隔离：参考 Obscura 的独立 browser server 模式，保持浏览器生命周期与 Agent Worker 解耦
- CLI 超时：将 `serve` 类进程的启动超时、运行超时、停止逻辑纳入后续评估
- 退出码：借鉴明确退出码语义，区分启动失败、运行失败、超时和外部终止
- 日志收集：保留 browser server stdout/stderr，便于定位 CDP 连接、页面加载和会话恢复问题

### 风险与未知

- xhs-mcp 兼容性：当前 v1 以 xhs-mcp 为数据采集主路径，需要验证其是否支持外部 CDP endpoint 或是否需要 fork 改造
- 小红书登录态：必须验证 cookies/session 能否稳定跨运行复用，且不会破坏现有登录预检流程
- CDP 行为差异：Playwright `connectOverCDP` 能连接不代表 XHS 搜索、详情页和反爬行为一致
- 运维复杂度：新增 Obscura 进程管理、端口管理、健康检查和日志轮转，会提高本地运行复杂度

### Spike 通过标准

只有以下条件全部通过，才考虑将 Obscura 纳入后续实现路线图：

1. Obscura `serve` 可启动本地 CDP endpoint
2. Playwright 能通过 `connectOverCDP` 打开普通网页
3. 最小 XHS 登录、搜索、详情脚本跑通
4. cookies/session 可跨运行复用
5. 内存占用、稳定性、任务成功率优于当前浏览器后端

## UI 进度展示

从 v2.1 的"4 阶段卡片"改为 **Agent Timeline**：

```
Timeline 实时事件流：
━━━ 🔍 searching ━━━━━━━━━━━━━━━━━━━━━━━━━━━
  10:23:01  搜索"深圳美甲"，找到 45 条笔记
  10:23:15  搜索"美甲推荐"，找到 38 条笔记
  10:23:22  发现 12 个候选账号，开始分类...
━━━ 📊 analyzing ━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  10:23:45  筛选出 5 个商家自营号
  10:24:01  正在分析 @深圳美甲小仙女...
  10:24:30  正在分析 @NailArt_Lisa...
  10:25:00  分析完成，发现 3 套可复用脚本模板
━━━ 📝 generating ━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  10:25:15  正在生成内容策略...
  10:25:45  正在生成第 2 条脚本...
━━━ ✅ validating ━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  10:26:00  校验通过：3 个对标账号，2 条脚本，证据完整
  10:26:02  ✅ 任务完成
```

前端通过 SSE 接收 TimelineEvent，映射为 4 个阶段标签（searching / analyzing / generating / validating），但内部是 Agent 自主决策的事件流，不是固定阶段。

## 验证方案

### 技术验收

1. **Sandbox 隔离：** Agent 崩溃不影响主进程，退出码正确
2. **SSE 推送：** 前端实时看到 Agent 的 tool call 和 progress 事件
3. **Budget 守卫：** 超过调用预算时 Agent 自动停止
4. **Validator：** 产物不通过时触发修复，最多 1 次

### 运营验收

1. **对标准确率 > 70%：** 至少 70% 是真正的同城商家自营号
2. **结论可追溯：** 每个分析结论有 2-5 个证据引用
3. **脚本可拍摄：** 有明确拍摄清单、出镜人员、场景要求
4. **人工评分 Rubric：** 每条脚本总分 ≥ 20/25，全部脚本平均分 ≥ 22/25

## 范围边界（MVP 不包含）

- 30 天内容日历
- 用户注册/登录系统
- 数据导出（PDF/Excel）
- 多项目管理
- 内容自动发布到小红书
- Docker 容器沙盒（MVP 用子进程，后续可升级）
- 多 LLM 切换（MVP 用 Claude，后续可扩展）
