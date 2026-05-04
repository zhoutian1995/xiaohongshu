# 实施计划：AI 对标账号分析与内容生成工具

## Context

设计文档 v2.1 已完成（`docs/superpowers/specs/2026-05-04-xhs-benchmark-tool-design.md`）。MVP 目标：输入城市+行业+门店情况问卷 → 自动找到 3-5 个高质量同城商家对标账号 → 输出证据型账号拆解 + 首周可拍脚本。

实施策略：**先做 xhs-mcp 连通 + 快速模式闭环，再做深度模式和精细评分。**

## 关键文件

- 设计文档：`docs/superpowers/specs/2026-05-04-xhs-benchmark-tool-design.md`
- xhs-mcp 源码：`https://github.com/ShunL12324/xhs-mcp`（需 clone）
- Claude API SDK：`@anthropic-ai/sdk`
- MCP SDK：`@modelcontextprotocol/sdk`

## 环境前置条件

| 依赖 | 版本要求 | 说明 |
|------|---------|------|
| Node.js | ≥ 22 | Next.js 15 + Web Streams API |
| Bun | latest | xhs-mcp 运行时（`bun install` + `bun run dev`） |
| Git | 任意 | 版本控制 |

### `.env.local` 必需字段

```env
ANTHROPIC_API_KEY=sk-ant-...     # Claude API 密钥
XHS_MCP_DATA_DIR=/Users/<user>/.xhs-mcp  # xhs-mcp 数据目录（必须用绝对路径，实现时用 path.resolve 或 os.homedir() 展开）
DATABASE_PATH=./data/xhs.db      # SQLite 数据库路径
```

### `.gitignore` 必须包含

```
data/                # SQLite 数据库文件
.xhs-mcp/            # xhs-mcp session 和下载缓存
.env.local           # 环境变量
```

---

## Step 1：项目初始化 + xhs-mcp 连通验证

**目标：** Next.js 项目跑起来，xhs-mcp 能正常调通

### 任务清单

- [ ] `git init` 初始化仓库
- [ ] 创建 Next.js 15 项目（TypeScript + Tailwind CSS + App Router）
- [ ] 安装核心依赖：`@anthropic-ai/sdk`、`better-sqlite3`、`@modelcontextprotocol/sdk`、`zod`
- [ ] 安装 shadcn/ui
- [ ] 配置 `package.json` scripts：
  ```json
  {
    "dev": "next dev",
    "worker": "tsx src/worker.ts",
    "test": "vitest",
    "lint": "next lint"
  }
  ```
- [ ] Clone xhs-mcp 到本地（`/Users/wille/projects/xhs-mcp`）
- [ ] 配置 xhs-mcp：扫码登录测试
- [ ] 编写 `src/lib/xhs-client.ts` — MCP Client 封装，调用 xhs-mcp Server
- [ ] 编写 `src/lib/claude.ts` — Claude API 封装（streaming 支持）
- [ ] 编写 `src/lib/types.ts` — 核心类型定义（Project、StoreProfile、Note、BenchmarkAccount 等）

### 验证标准

- 扫码登录后调用 `xhs_search("深圳美甲")` 能返回笔记列表
- Claude API 调用能返回正常响应

---

## Step 2：数据库 + Job Runner

**目标：** 后台任务引擎可用，支持断点续跑

### 任务清单

- [ ] 编写 `src/lib/db.ts` — SQLite schema：
  - `projects` 表（项目基础信息 + 门店问卷 + 状态）
  - `benchmark_accounts` 表（对标账号 + 分类 + 评分）
  - `notes` 表（笔记详情 + 运营指标）
  - `job_events` 表（任务事件日志，用于 SSE 推送）
  - `cache` 表（采集缓存，按 noteId/userId + TTL 索引）
- [ ] 编写 `src/lib/job-runner.ts` — 任务状态机：
  - 状态：`queued → running → paused → completed | error`
  - 阶段编排：记录 `currentPhase`，支持断点续跑
  - 失败重试：单次调用重试 3 次（2s → 4s → 8s 递增间隔）
  - 错误隔离：单个账号失败不阻塞整体任务
- [ ] 编写 `src/worker.ts` — 独立 worker 入口脚本（`npm run worker`）：
  - **启动方式：** `npm run worker` 独立进程启动，轮询 `projects` 表中 `status = 'queued'` 的任务
  - **为什么不放在 API Route 里：** Next.js API Route 有请求生命周期限制，长任务（5-15 分钟浏览器自动化 + Claude 多轮）会被中断
  - **MVP 运行方式：** 两个终端，一个 `npm run dev`（前端+API），一个 `npm run worker`（后台任务）
  - 轮询间隔：2 秒检查一次是否有新任务
  - 支持 graceful shutdown（Ctrl+C 后完成当前阶段再退出）
- [ ] 编写 `src/lib/rate-limiter.ts` — 限流器：
  - xhs-mcp 请求间隔 ≥ 2 秒
  - Claude API 请求间隔 ≥ 1 秒
  - 串行执行（同时只处理 1 个账号）
- [ ] 编写 `src/lib/cache.ts` — 缓存层：
  - 同一笔记/账号 24 小时内不重复采集
  - 搜索结果缓存 1 小时
- [ ] 编写 API Routes：
  - `POST /api/jobs` — 创建分析任务，返回 jobId
  - `GET /api/jobs/[id]` — 查询任务状态和结果
  - `GET /api/jobs/[id]/stream` — SSE 实时进度推送

### 验证标准

- 创建任务 → 数据库正确记录项目状态
- SSE 连接能收到阶段进度事件
- 模拟中断 → 重启后从失败阶段继续

---

## Step 3：阶段 1 — 对标发现 + 分类（快速模式）

**目标：** 输入城市+行业，输出 3 个高质量商家自营号

### 任务清单

- [ ] 编写 `src/lib/phases/discover.ts`：
  - `generateSearchKeywords(profile)` — 多关键词组合生成（城市+行业、商圈+行业、推荐、避雷、价格、项目名）
  - 对每组关键词调用 `xhs_search`，合并去重候选账号
  - **快速模式：使用固定 3 个关键词**（`{城市}{行业}`、`{行业}推荐`、`{行业}避雷`），每个关键词取前 20 条笔记
  - **深度模式：使用完整关键词池**（6-8 个组合），每个关键词取前 30 条笔记
- [ ] 编写 `src/lib/classifier.ts`：
  - `preFilterAccount(profile, notes)` — 硬规则预筛：
    - 简介含"预约/地址/营业" → merchant
    - 简介含"探店/合作" → influencer
    - 机构名/品牌名 → brand
    - 笔记反复出现同一门店 → merchant
    - 笔记全是团购 → deal
  - `classifyWithAI(uncertainAccount)` — AI 精分（仅对 uncertain 账号调用）
- [ ] 编写 `src/prompts/classify-account.ts` — 账号分类 prompt：
  - 输入：账号资料 + 近 5 篇笔记标题/简介
  - 输出：JSON `{ type, confidence, reasoning }`
- [ ] 筛选 merchant 类型账号，进入阶段 2

### 验证标准

- 输入"深圳美甲"，候选池中达人号/品牌号被正确过滤
- 输出的 3 个账号都是真正的同城商家自营号
- 对标准确率 ≥ 70%

---

## Step 4：阶段 2 — 对标评分 + 深度分析（快速模式）

**目标：** 对 3 个对标账号做证据型深度分析

### 任务清单

- [ ] 编写 `src/lib/scorer.ts` — 多维评分模型：
  ```
  权重：同城相关性 25% | 行业相关性 20% | 咨询评论密度 20% | 活跃度 15% | 近期爆款率 10% | 可学习性 10%
  ```
  - 同城相关性：笔记是否提到同城地点、评论是否有同城用户
  - 行业相关性：笔记内容与目标行业的重叠度
  - 咨询评论密度（**快速模式降级为代理指标**）：
    - **快速模式：** 不采集评论，用"收藏数/评论数比"代理（高收藏/评论比通常意味着实用内容，吸引咨询型评论）。权重从 20% 降为 10%，分给"活跃度"使其变为 25%。计算公式：`ratio = favorites / Math.max(comments, 1)`，再做 capped normalization（超过 P95 的值封顶为 10 分）
    - **深度模式：** 采集 Top 10 评论文本，真实计算咨询类评论占比，权重恢复 20%
    - 快速模式权重调整：同城 25% | 行业 20% | 代理咨询密度 10% | 活跃度 25% | 爆款率 10% | 可学习 10%
  - 活跃度：近 30/90 天发布数
  - 近期爆款率：近 30 天超过平均互动的笔记占比
  - 可学习性：内容是否依赖大量预算/明星/特殊资源
- [ ] 编写 `src/lib/phases/analyze.ts`：
  - 采集每个账号近 10 篇笔记详情（快速模式）
  - 计算评分，排序取 Top 3
  - 调用 Claude 做深度分析
- [ ] 编写 `src/prompts/analyze-account.ts` — 账号分析 prompt：
  - **核心要求：证据绑定** — 每个结论必须附带 `evidence[]`（noteId + title + 数据指标）
  - **引用规则：** 只引用标题、指标、URL、摘要，不引用大段原文
  - 输出：JSON（positioning、contentTypes、activityPattern、hitPattern、evidenceList）
- [ ] 分析维度：
  - 账号定位（人设标签、目标人群、差异化卖点）
  - 内容类型分布（教程/对比/日常/测评占比）
  - 发布频率和时间规律
  - 爆款笔记共性

### 验证标准

- 每个分析结论都有 2-5 个证据引用
- 评分结果可复现（相同输入 → 相同排序）

---

## Step 5：阶段 3 — 脚本框架拆解（快速模式）

**目标：** 爆款 vs 普通对比分析，输出可复用脚本模板

### 任务清单

- [ ] 编写 `src/lib/phases/breakdown.ts`：
  - 对每个对标账号，将笔记按互动数据分组：
    - **≥ 10 篇：** Top 5 为 hit 组，Bottom 5 为 average 组
    - **6-9 篇：** Top 40% 为 hit 组，Bottom 40% 为 average 组
    - **< 6 篇：** 跳过该账号的拆解（样本量不足，结论不可靠）
  - 分别拆解两组笔记的脚本结构
  - 对比找出差异因子
- [ ] 编写 `src/prompts/breakdown-script.ts` — 脚本拆解 prompt：
  - 输入：爆款笔记组 + 普通笔记组
  - 输出 JSON：
    ```json
    {
      "hitPatterns": [{ "titleFormula", "coverStyle", "hookTechnique", "ctaTechnique", "evidence" }],
      "averagePatterns": [{ "titleFormula", "coverStyle", "hookTechnique", "ctaTechnique", "evidence" }],
      "differenceFactors": [{ "dimension", "hitBehavior", "averageBehavior", "impact" }],
      "reusableTemplates": [{ "name", "structure", "applicableScenarios", "referenceNotes" }]
    }
    ```
- [ ] 归纳 3-5 套可复用脚本模板

### 验证标准

- 输出包含明确的"爆款 vs 普通"差异分析
- 每套模板标注适用场景 + 参考笔记来源

---

## Step 6：阶段 4 — 首周脚本生成

**目标：** 结合门店问卷，生成 2 条可直接拍摄的脚本（快速模式）

### 任务清单

- [ ] 编写 `src/lib/phases/generate.ts`：
  - 汇总门店问卷 + 前三阶段分析结果
  - 调用 Claude 生成内容
- [ ] 编写 `src/prompts/generate-script.ts` — 内容生成 prompt：
  - **核心约束：**
    - "学习结构，不复用表达" — 不复制竞品的具体文案、标题、封面设计
    - 脚本必须基于门店真实素材和条件（出镜人、可拍场景、禁忌表达）
    - 每条脚本标注参考了对标的哪些笔记
  - 输出 JSON：
    - 账号定位建议（附对标依据）
    - 7 天启动计划（每天拍什么、怎么拍、谁出镜）
    - 10 个选题池（从爆款共性提取，标注来源）
    - 2 条可拍脚本（标题、封面描述、正文逐字稿、拍摄清单、话题标签、参考笔记）

### 验证标准

- 脚本有明确的拍摄清单（场景、人员、道具）
- 脚本内容与门店问卷匹配（不生成门店无法执行的内容）
- 人工评分 Rubric 通过（总分 ≥ 20/25）：
  | 维度 | 1 分 | 3 分 | 5 分 |
  |------|------|------|------|
  | 选题清晰度 | 和门店业务无关 | 有相关性但泛化 | 精准命中差异化卖点 |
  | 拍摄可行性 | 需要门店没有的资源 | 基本可拍但需额外准备 | 现有素材/人员即可完成 |
  | 门店差异化 | 和同行同质化 | 有差异但不够突出 | 清晰传达"为什么选这家" |
  | 转化意图 | 无任何引导 | 有引导但生硬 | 自然引导到预约/咨询/到店 |
  | 平台合规 | 违反社区规范 | 边缘地带 | 完全合规 |

---

## Step 7：前端单页工作台

**目标：** 完整的用户界面（可与 Step 3-6 并行开发，使用 mock 数据）

### Mock 数据契约

前端开发时使用 `src/lib/mock-data.ts` 提供的 mock 数据，确保接口格式与后端一致：

```typescript
// mock-data.ts 中应包含的 mock 结构
mockProject: Project           // 一个完整的分析任务
mockAccounts: BenchmarkAccount[] // 3 个对标账号（含评分和分析）
mockNotes: Note[]              // 带脚本拆解的笔记
mockStrategy: ContentStrategy  // 生成的内容策略（含 2 条脚本）
mockJobEvents: JobEvent[]      // SSE 事件序列（4 个阶段的进度事件）
```

### 任务清单

- [ ] 编写 `src/app/page.tsx` — 主页面布局（左输入 + 右结果）
- [ ] 编写 `src/app/layout.tsx` — 全局布局
- [ ] 编写 `src/components/StoreProfileForm.tsx` — 门店情况问卷表单：
  - 基础信息：行业、城市、区域、店名
  - 定价客群：价格区间、目标客群、商圈
  - 能力素材：擅长项目、真实优势、可拍素材、出镜信息
  - 运营情况：发布频率、已有账号、禁忌表达
  - 转化方式
  - 模式选择（快速/深度）
- [ ] 编写 `src/components/ResultPanel.tsx` — 结果展示面板：
  - 4 个阶段进度卡片（等待/进行中/完成/错误）
  - SSE 实时进度更新
- [ ] 编写 `src/components/AccountCard.tsx` — 账号分析卡片：
  - 基础信息、评分、分类标签
  - 分析结论 + 证据引用（可展开）
- [ ] 编写 `src/components/ScriptCard.tsx` — 脚本展示卡片：
  - 标题、封面描述、逐字稿、拍摄清单
  - 参考笔记链接
- [ ] 编写 `src/components/EvidenceTag.tsx` — 证据引用标签组件
- [ ] SSE 客户端：`useJobStream(jobId)` hook

### 验证标准

- 表单填写完整 → 点击启动 → 左侧显示进度
- 各阶段完成后结果实时渲染
- 证据引用可点击展开

---

## Step 8：快速模式端到端测试 + 修复

**目标：** 快速模式闭环稳定可用

### 任务清单

- [ ] 用"深圳美甲"跑完整快速模式流程
- [ ] 检查对标准确率（≥ 70% 的结果是商家自营号）
- [ ] 检查结论可追溯性（每个结论有证据）
- [ ] 检查脚本可拍摄性（人工评分 Rubric ≥ 20/25）
- [ ] 检查端到端耗时（5-8 分钟内）
- [ ] 修复发现的问题
- [ ] 检查断点续跑（中途取消 → 重启 → 从断点继续）
- [ ] 纯函数单测（Vitest）：
  - `generateSearchKeywords()` — 输入门店问卷，验证关键词数量和格式
  - `preFilterAccount()` — 输入 mock 账号数据，验证分类准确性
  - `calculateScore()` — 输入评分维度，验证加权计算结果
  - `cache.get()` / `cache.set()` — 验证 TTL 过期行为
  - SSE event 格式 — 验证 JobEvent 结构符合前端消费契约

---

## 项目结构总览

```
xiaohongshu/
├── src/
│   ├── app/
│   │   ├── page.tsx                    # Step 7
│   │   ├── layout.tsx                  # Step 7
│   │   └── api/
│   │       ├── jobs/route.ts           # Step 2 (POST 创建任务)
│   │       └── jobs/[id]/
│   │           ├── route.ts            # Step 2 (GET 查询任务状态和结果)
│   │           └── stream/route.ts     # Step 2 (SSE 实时进度推送)
│   ├── worker.ts                       # Step 2 (独立 worker 入口：npm run worker)
│   ├── components/
│   │   ├── StoreProfileForm.tsx        # Step 7
│   │   ├── ResultPanel.tsx             # Step 7
│   │   ├── AccountCard.tsx             # Step 7
│   │   ├── ScriptCard.tsx              # Step 7
│   │   └── EvidenceTag.tsx             # Step 7
│   ├── lib/
│   │   ├── xhs-client.ts               # Step 1
│   │   ├── claude.ts                   # Step 1
│   │   ├── types.ts                    # Step 1
│   │   ├── db.ts                       # Step 2
│   │   ├── job-runner.ts               # Step 2
│   │   ├── rate-limiter.ts             # Step 2
│   │   ├── cache.ts                    # Step 2
│   │   ├── classifier.ts               # Step 3
│   │   ├── scorer.ts                   # Step 4
│   │   └── phases/
│   │       ├── discover.ts             # Step 3
│   │       ├── analyze.ts              # Step 4
│   │       ├── breakdown.ts            # Step 5
│   │       └── generate.ts             # Step 6
│   └── prompts/
│       ├── classify-account.ts         # Step 3
│       ├── analyze-account.ts          # Step 4
│       ├── breakdown-script.ts         # Step 5
│       └── generate-script.ts          # Step 6
├── docs/
│   └── superpowers/specs/
│       ├── 2026-05-04-xhs-benchmark-tool-design.md   # 设计文档 v2.1
│       └── 2026-05-04-xhs-benchmark-tool-plan.md     # 本文件
├── package.json
├── tailwind.config.ts
└── tsconfig.json
```

## 实施顺序

```
Step 1（初始化+连通）
    ↓
Step 2（DB+Job Runner）
    ↓
Step 3（对标发现+分类）──→ Step 4（评分+分析）──→ Step 5（脚本拆解）──→ Step 6（脚本生成）
                                                                                    ↓
Step 7（前端 UI）←───────────────────────────────────────────────────────────────────┘
    ↓
Step 8（端到端测试+修复）
```

Step 3-6 是核心业务逻辑，可以按顺序开发。Step 7 可以和 Step 3-6 并行开发（用 mock 数据），但建议在 Step 6 完成后再做集成。
