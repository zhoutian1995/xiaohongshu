# AI 对标账号分析与内容生成工具 — 设计文档 v2.1

## Context

本地生活商家（美业、餐饮、健身、医美等）想做小红书账号，但不知道怎么定位、怎么写内容。目前行业内代运营团队的手动流程是：找对标账号 → 分析账号定位和内容 → 拆解脚本框架 → 为客户设计内容策略。这个过程纯手动，耗时耗力，且高度依赖个人经验。

本工具的目标是将这个手动流程自动化：用户填写门店情况问卷，工具自动找到 3-5 个高质量同城商家对标账号，输出证据型账号拆解和首周可拍脚本。

### 核心原则

- **证据驱动：** 每个分析结论都必须附带来源（哪篇笔记、哪条评论、哪个数据指标），不做无源结论
- **可执行优先：** 输出内容必须能直接指导拍摄和发布，拒绝泛化方案
- **合规边界：** 竞品内容仅用于分析学习，不直接复制他人的图片、视频、文案作为商用素材

## MVP 范围

输入：城市 + 行业 + 门店情况问卷
↓
输出：3-5 个高质量对标账号的**证据型拆解** + **首周 2 条可拍脚本**（快速模式）+ **7 天启动计划** + **10 个选题池**

MVP 不做：30 天日历、完整策略报告、用户系统、数据导出、内容自动发布。

## 产品定位

- **形态：** Web 应用（单页工作台）
- **用户：** 先自己用（MVP），后续可扩展
- **核心体验：** 全自动流水线 — 填好问卷一键启动，实时查看分析进度和结果

## 技术栈

| 层 | 技术 | 说明 |
|---|---|---|
| 前端 | Next.js 15 (App Router) | 全栈框架 |
| UI | Tailwind CSS + shadcn/ui | 快速搭建，够用即可 |
| 后端 | Next.js API Routes + Job Worker | API + 后台任务 + SSE 推送 |
| 数据采集 | xhs-mcp (ShunL12324/xhs-mcp) | 小红书 MCP 服务器，Playwright + 真实浏览器 |
| AI | Claude API (@anthropic-ai/sdk) | 账号分类、分析、脚本拆解、内容生成 |
| 语言 | TypeScript | 全栈统一 |
| 数据存储 | SQLite (better-sqlite3) | 项目、任务状态、分析结果、缓存 |

## 数据采集方案：xhs-mcp

### 为什么选 xhs-mcp

- **降低自动化特征：** 用真实浏览器 + 扫码登录，行为接近真人操作，比传统爬虫（直接调内部 API）更不易被风控识别。但**不等于完全安全或合规**
- **功能全：** 搜索笔记、获取笔记详情、用户资料、评论数据
- **技术匹配：** TypeScript + Bun + Playwright + SQLite，和主项目技术栈一致
- **风控保护：** 内置请求间隔控制（`XHS_MCP_REQUEST_INTERVAL`），多账号管理

### 风险与合规

| 风险 | 说明 | 应对措施 |
|------|------|---------|
| 账号风控 | 自动化操作可能触发平台风控 | 使用小号；请求间隔 ≥ 2s；单次任务控制在 3-5 个账号 |
| 平台条款 | 自动化采集可能违反用户协议 | 仅用于个人学习分析；不批量采集；不商用他人内容 |
| 数据使用 | 采集到的他人内容有版权 | 分析结论可参考，但不直接复制图片、视频、文案作为自己的发布内容 |
| 任务失败 | 网络波动、登录过期等导致中断 | 设计断点续跑、失败重试、本地缓存（见任务可靠性设计） |

### 使用的 xhs-mcp 工具

| 阶段 | 工具 | 用途 |
|------|------|------|
| 对标发现 | `xhs_search` | 关键词搜索笔记 |
| 对标发现 | `xhs_user_profile` | 获取用户资料和笔记列表 |
| 账号分析 | `xhs_user_profile` | 获取用户详情 |
| 账号分析 | `xhs_get_note` | 获取笔记详情和评论（用于证据绑定） |

**注意：MVP 不下载图片/视频。** 减少调用量，降低风控风险，也避免版权问题。

## 架构

```
┌──────────────────────────────────────────────────┐
│              Next.js App (单页面)                   │
│  ┌──────────────┐  ┌─────────────────────────┐   │
│  │ 门店情况问卷  │  │      结果展示面板         │   │
│  │ - 行业/城市   │  │  ① 对标账号发现          │   │
│  │ - 结构化问卷  │  │  ② 账号深度分析          │   │
│  │ - 模式选择    │  │  ③ 脚本框架拆解          │   │
│  │ [启动]       │  │  ④ 首周脚本生成          │   │
│  └──────────────┘  └─────────────────────────┘   │
└────────────────┬─────────────────────────────────┘
                 │ REST API（创建/查询任务）+ SSE（实时进度）
┌────────────────┼─────────────────────────────────┐
│              Job Runner (后台任务引擎)               │
│                                                  │
│  ┌──────────────────────────────────────────┐    │
│  │ 状态机: queued → running → completed/error │    │
│  │ 断点续跑 + 失败重试 + 本地缓存             │    │
│  └──────────────────────────────────────────┘    │
│                                                  │
│  ① 发现 → ② 分类评分 → ③ 拆解 → ④ 生成         │
│     │         │            │         │           │
│  xhs_search  Claude     Claude    Claude API    │
│  xhs_user    (分类器)    (分析)    (生成脚本)     │
│  _profile    (评分模型)  (证据)                   │
└────────────────┴─────────────────────────────────┘
```

### 核心组件

1. **Job Runner** — 后台任务引擎，独立于 API 请求生命周期运行。包含任务表、状态机、重试机制、本地缓存
2. **xhs-mcp Integration** — 通过 `@modelcontextprotocol/sdk` 作为 MCP Client 连接 xhs-mcp Server，封装工具调用
3. **Claude Analyzer** — 封装 Claude API，每个阶段设计专用 prompt，输出结构化 JSON + 证据引用
4. **Storage** — SQLite 存储项目、任务状态、分析结果、采集缓存

### 为什么不用 API Route 直接跑 Pipeline

浏览器自动化（Playwright）和 Claude 多轮分析都是长任务（可能 5-15 分钟），不适合塞在 Next.js API Route 的请求生命周期里。Job Runner 模式下：
- 前端创建任务 → 立即返回 jobId
- 后台 worker 执行任务 → 更新数据库状态
- 前端通过 SSE 订阅进度 → 实时展示

## 用户输入：结构化门店问卷

不使用自由文本输入，改为结构化问卷，确保 AI 能生成精准策略：

```typescript
interface StoreProfile {
  // 基础信息
  industry: string         // "美甲"
  city: string             // "深圳"
  district?: string        // "南山区"
  storeName: string        // 店铺名称

  // 定价与客群
  priceRange: string       // "100-300元" / 客单价
  targetAudience: string   // "25-35岁白领女性"
  businessArea: string     // "科技园商圈" / 写字楼密集区

  // 能力与素材
  specialties: string[]    // ["日式美甲", "建构", "手绘"]
  realAdvantages: string[] // ["10年经验", "进口甲油", "无隐形消费"]
  filmableAssets: string[] // ["工作台", "作品展示墙", "前后对比图"]
  onCamera: boolean        // 老板/员工是否出镜
  onCameraInfo?: string    // 出镜人员特点（如"老板本人，亲和力强"）

  // 运营情况
  postFrequency: string    // "每周3-4篇" / 可承接频率
  existingAccount?: string // 已有账号链接（可选）
  forbiddenTopics?: string[] // 禁忌表达（如"不提价格战"）

  // 转化方式
  conversionMethod: string // "私信预约" / "群聊转化" / "到店团购"
}
```

## 四个阶段详细设计

### 阶段 1：对标账号发现 + 分类

**输入：** 行业 + 城市 + 门店问卷

**流程：**

**1a. 多关键词组合搜索**

单一关键词搜索候选池质量不稳定，尤其美甲、医美、健身等竞争词会混入大量达人和合集。使用关键词组合策略扩大覆盖、提高精准度：

```typescript
// 基于门店问卷自动生成搜索关键词组合
function generateSearchKeywords(profile: StoreProfile): string[] {
  const keywords: string[] = [
    `${profile.city}${profile.industry}`,           // "深圳美甲"
    `${profile.industry}推荐`,                       // "美甲推荐"
    `${profile.industry}避雷`,                       // "美甲避雷"（了解反面案例）
    `${profile.industry}${profile.priceRange}`,      // "美甲 100-300"
    ...profile.specialties.map(s => `${profile.industry}${s}`), // "美甲建构"
  ]
  // 有 district 才生成商圈/区级关键词
  if (profile.district) {
    keywords.push(`${profile.district}${profile.industry}`) // "南山区美甲"
  }
  return keywords
}
```

对每组关键词执行 `xhs_search`，合并去重后得到候选账号列表。

**1b. 账号分类器（规则预筛 + AI 精分）**

纯 AI 分类成本高且容易被少量笔记误导。采用"规则预筛 → AI 精分"两阶段：

**第一步：硬规则预筛**（不需要调用 Claude，零成本）

```typescript
function preFilterAccount(profile: xhs_user_profile, notes: Note[]): AccountType | 'uncertain' {
  const bio = profile.bio.toLowerCase()
  const nickname = profile.nickname

  // 强特征 → 直接判定
  if (bio.includes('预约') || bio.includes('地址') || bio.includes('营业'))
    return 'merchant'          // 简介有地址/预约/营业时间 → 商家号
  if (bio.includes('探店') || bio.includes('合作'))
    return 'influencer'        // 简介有探店/合作 → 达人号
  if (isInstitutionName(nickname))
    return 'brand'             // 机构名/品牌名 → 品牌号
  if (notesHaveSameStore(notes))
    return 'merchant'          // 笔记反复出现同一门店 → 商家号
  if (notesAllDeals(notes))
    return 'deal'              // 笔记全是团购 → 团购号

  return 'uncertain'           // 无法判定 → 交给 AI
}
```

**第二步：AI 精分**（仅对 `uncertain` 的账号调用 Claude）

```
账号类型分类：
├── 商家自营号  ← 我们要找的主要目标
├── 达人探店号  ← 排除（运营逻辑完全不同）
├── 团购引流号  ← 排除（低质量内容）
├── 素人种草号  ← 可参考但不作为对标
└── 品牌/聚合营销号  ← 排除（资源不对等）
```

**1c. 筛选商家自营号作为候选**

**输出：** 分类后的账号列表（标注每个账号的类型 + 分类依据 + 判定方式：规则/AI）

### 阶段 2：对标评分 + 深度分析

**输入：** 商家自营号候选列表

**流程：**

**2a. 对标评分模型**

不再使用"粉丝量 × 互动率"，改用多维评分：

```typescript
interface BenchmarkScore {
  // 同城相关性（该账号的内容是否服务于同城客户）
  localRelevance: number    // 0-10

  // 行业相关性（内容是否和我们行业高度重叠）
  industryRelevance: number // 0-10

  // 内容活跃度（近 30/90 天是否持续发布）
  activityScore: number     // 0-10

  // 近期爆款率（近 30 天内有多少篇笔记超过平均互动）
  recentHitRate: number     // 0-10

  // 咨询评论密度（评论中咨询/预约类评论占比，反映转化意图）
  consultCommentRate: number // 0-10

  // 低粉高赞样本（是否有低粉时期的爆款，说明内容本身有价值）
  hasOrganicHits: boolean

  // 可学习性（内容模式是否可复制，还是依赖大量预算/明星资源）
  learnability: number      // 0-10

  // 综合分（加权平均）
  overallScore: number      // 0-100
}

// 默认权重定义
const SCORE_WEIGHTS = {
  localRelevance:      0.25,   // 同城相关性 25%（本地生活核心指标）
  industryRelevance:   0.20,   // 行业相关性 20%
  consultCommentRate:  0.20,   // 咨询评论密度 20%（反映真实转化）
  activityScore:       0.15,   // 活跃度 15%
  recentHitRate:       0.10,   // 近期爆款率 10%
  learnability:        0.10,   // 可学习性 10%
} // 总计 100%
```

**评分计算逻辑：** `overallScore = Σ(score[i] × weight[i]) × 10`（各维度 0-10 分，加权后映射到 0-100）

按综合分排序 → 取 **Top 3-5**（不是 10 个）。

**2b. 深度分析（对每个对标账号）**

采集近 15-20 篇笔记 + 评论样本，Claude API 分析：
- 账号定位（人设标签、目标人群、差异化卖点）
- 内容类型分布（教程/对比/日常/测评占比）
- 发布频率和时间规律
- 互动数据趋势
- 爆款笔记共性

**关键：证据绑定。** 每个分析结论必须引用来源：

```json
{
  "conclusion": "该账号以'对比类'内容为核心差异化，占比 45%",
  "evidence": [
    {"noteId": "xxx", "title": "300元 vs 3000元美甲对比", "type": "对比"},
    {"noteId": "yyy", "title": "美团店 vs 私人工作室", "type": "对比"},
    {"noteId": "zzz", "title": "Gel vs 甲油胶终极对比", "type": "对比"}
  ],
  "metric": "对比类 9/20 篇 = 45%，平均点赞 1200，高于教程类平均 600"
}
```

**证据引用规则：**
- 引用笔记标题、数据指标、URL、摘要（一句话概括），**不引用大段原文**
- 脚本生成时的原则是**"学习结构，不复用表达"** — 分析竞品的脚本框架和选题逻辑，但不复制具体文案、标题、封面设计
- 这样既保证结论可追溯，又降低版权和平台风险

**输出：** 带证据引用的账号分析报告

### 阶段 3：脚本框架拆解

**输入：** 每个对标账号的笔记数据

**流程：**
1. **对比拆解：** 对每个账号，同时拆解"爆款笔记"（互动 Top 5）和"普通笔记"（互动 Bottom 5），找差异因子：

```
爆款特征 vs 普通特征 对比：
- 标题：爆款用"数字+对比句式"，普通用"描述性标题"
- 钩子：爆款前 2 行有明确痛点/利益点，普通直接进入教程
- 封面：爆款用"对比拼图/前后对比"，普通用"成品展示"
- CTA：爆款结尾有明确引导（"评论区告诉我"），普通无
```

2. 归纳出 3-5 套可复用的脚本模板，每套附证据来源

**输出：** 带差异分析的脚本模板库，每个模板标注适用场景 + 参考笔记

### 阶段 4：首周脚本生成

**输入：** 门店问卷 + 前三个阶段的分析结果

**流程：**
Claude API 综合生成：

1. **账号定位建议**（结合用户优势和竞品空缺，附对标依据）
2. **7 天启动计划**（每天拍什么、怎么拍、谁出镜、门店怎么配合）
3. **10 个选题池**（从对标账号的爆款共性中提取，标注来源）
4. **2-3 条可直接拍摄的脚本**（快速模式 2 条，深度模式 3 条；标题、封面描述、正文逐字稿、拍摄清单、话题标签）

**关键约束：**
- 每条脚本必须标注参考了哪些对标账号的哪些笔记
- 脚本内容必须基于门店问卷的真实素材和条件（出镜人、可拍场景等）
- 不生成门店无法执行的脚本

**输出：** 可直接执行的拍摄指南 + 脚本逐字稿

## 数据模型

```typescript
// 项目：一次完整的对标分析任务
interface Project {
  id: string
  storeProfile: StoreProfile     // 结构化门店问卷
  mode: 'fast' | 'deep'          // 快速模式/深度模式
  status: 'queued' | 'running' | 'paused' | 'completed' | 'error'
  currentPhase: number           // 当前阶段（支持断点续跑）
  phases: PhaseResult[]
  createdAt: Date
  completedAt?: Date
  errorMessage?: string
}

// 对标账号
interface BenchmarkAccount {
  userId: string
  nickname: string
  avatar: string
  followers: number
  notesCount: number

  // 账号分类
  accountType: 'merchant' | 'influencer' | 'deal' | 'user' | 'brand'
  classificationEvidence: string  // 分类依据（引用了哪些笔记/数据）

  // 运营指标
  notesLast30d: number           // 近 30 天发布数
  notesLast90d: number           // 近 90 天发布数
  avgLikes: number
  avgComments: number
  avgFavorites: number
  avgShares: number
  collectToLikeRatio: number     // 收藏/点赞比（反映内容实用价值）
  consultCommentRate: number     // 咨询评论密度

  // 评分
  score: BenchmarkScore

  // 分析结果
  positioning: string            // 账号定位（附证据）
  contentTypes: ContentType[]    // 内容类型分布（附证据）
  analysis: AccountAnalysis      // 完整分析（附证据）
}

// 笔记（完整运营字段）
interface Note {
  noteId: string
  noteUrl: string                // 原始链接
  title: string
  content: string
  type: 'image' | 'video'        // 笔记类型
  mediaCount: number             // 图片/视频数量

  // 互动数据
  likes: number
  comments: number
  favorites: number
  shares: number

  // 内容标签
  tags: string[]
  isCollection: boolean          // 是否合集
  isDeal: boolean                // 是否团购

  // 时间
  publishedAt: Date
  collectedAt: Date              // 采集时间
  dataFreshness: 'fresh' | 'stale' // 数据新鲜度

  // 分类
  performanceTier: 'hit' | 'average' | 'low'  // 爆款/普通/低表现

  // 脚本拆解（可选）
  scriptBreakdown?: ScriptBreakdown

  // 评论样本（Top 10 热门评论）
  commentSamples?: CommentSample[]
}

interface CommentSample {
  content: string
  likes: number
  type: 'consult' | 'praise' | 'question' | 'other'  // 咨询/好评/提问/其他
}

// 脚本拆解
interface ScriptBreakdown {
  titleFormula: string
  coverStyle: string
  structure: string[]
  hookTechnique: string
  ctaTechnique: string
  evidence: EvidenceReference[]  // 参考笔记
}

// 证据引用
interface EvidenceReference {
  noteId: string
  title: string
  url: string
  relevantData?: string         // 相关数据点
}

// 生成的内容策略
interface ContentStrategy {
  // 账号定位
  positioning: string
  positioningEvidence: EvidenceReference[]

  // 7 天启动计划
  weekPlan: DayPlan[]

  // 选题池
  topicPool: Topic[]

  // 可拍脚本
  scripts: ShootableScript[]

  // 话题标签库
  tagLibrary: TagCategory[]
}

interface ShootableScript {
  title: string
  coverDescription: string       // 封面描述（怎么拍）
  copy: string                   // 正文逐字稿
  shootingChecklist: string[]    // 拍摄清单（需要什么道具/场景/人员）
  tags: string[]                 // 话题标签
  referenceNotes: EvidenceReference[]  // 参考了对标的哪些笔记
}
```

## 任务可靠性设计

### 快速模式 vs 深度模式

| | 快速模式 | 深度模式 |
|---|---|---|
| 搜索笔记数 | 1 轮搜索 | 2-3 轮搜索（不同关键词组合） |
| 候选账号数 | 8-12 个 | 30-50 个 |
| 最终对标数 | 3 个 | 5 个 |
| 每账号笔记数 | 10 篇 | 20 篇 |
| 评论采集 | 不采集 | 采集 Top 10 评论文本 |
| 脚本生成 | 2 条 | 3 条 |
| 预计耗时 | 5-8 分钟 | 10-15 分钟 |

### 断点续跑

- 每个阶段完成后，将中间结果写入 SQLite
- 任务失败时记录失败阶段和错误信息
- 重启任务时从失败阶段继续，不重复已完成的工作

### 失败重试

- 单次 xhs-mcp 调用失败 → 重试 3 次，间隔递增（2s → 4s → 8s）
- Claude API 失败 → 重试 2 次
- 单个账号分析失败 → 跳过该账号，继续处理其他账号
- 全部账号失败 → 标记任务为 error，输出已收集的部分结果

### 缓存

- 同一账号 24 小时内不重复采集
- 搜索结果缓存 1 小时
- Claude API 分析结果缓存（相同输入不重复调用）

### 限流

- xhs-mcp 请求间隔 ≥ 2 秒
- Claude API 请求间隔 ≥ 1 秒
- 并发限制：同时只分析 1 个账号（串行）

## 项目结构

```
xiaohongshu/
├── src/
│   ├── app/                        # Next.js App Router
│   │   ├── page.tsx                # 主页面（单页工作台）
│   │   ├── layout.tsx
│   │   └── api/
│   │       ├── jobs/
│   │       │   └── route.ts        # 创建/查询任务
│   │       └── jobs/[id]/
│   │           └── stream/route.ts # SSE 进度推送
│   ├── components/
│   │   ├── StoreProfileForm.tsx    # 门店情况问卷表单
│   │   ├── ResultPanel.tsx         # 结果展示面板
│   │   ├── PhaseCard.tsx           # 阶段进度卡片
│   │   ├── AccountCard.tsx         # 账号分析卡片（含证据引用）
│   │   ├── ScriptCard.tsx          # 可拍脚本卡片
│   │   └── EvidenceTag.tsx         # 证据引用标签组件
│   ├── lib/
│   │   ├── job-runner.ts           # 后台任务引擎（状态机 + 重试 + 断点）
│   │   ├── rate-limiter.ts         # 限流器
│   │   ├── cache.ts                # 缓存层
│   │   ├── phases/
│   │   │   ├── discover.ts         # 阶段 1：对标发现 + 分类
│   │   │   ├── score.ts            # 阶段 2a：对标评分
│   │   │   ├── analyze.ts          # 阶段 2b：深度分析（证据绑定）
│   │   │   ├── breakdown.ts        # 阶段 3：脚本拆解（对比分析）
│   │   │   └── generate.ts         # 阶段 4：首周脚本生成
│   │   ├── xhs-client.ts           # xhs-mcp 客户端封装
│   │   ├── claude.ts               # Claude API 封装
│   │   ├── classifier.ts           # 账号分类器（Claude prompt）
│   │   ├── scorer.ts               # 对标评分模型
│   │   ├── db.ts                   # SQLite 数据库
│   │   └── types.ts                # 类型定义
│   └── prompts/                    # Claude prompt 模板
│       ├── classify-account.ts     # 账号分类 prompt
│       ├── analyze-account.ts      # 账号分析 prompt（含证据绑定指令）
│       ├── breakdown-script.ts     # 脚本拆解 prompt（含对比分析指令）
│       └── generate-script.ts      # 脚本生成 prompt（含约束条件）
├── docs/
│   └── superpowers/specs/
├── package.json
├── tailwind.config.ts
└── tsconfig.json
```

## 验证方案

### 技术验收（能跑通）

1. **xhs-mcp 连通性：** 扫码登录后，`xhs_search` 能返回结果
2. **端到端快速模式：** 输入"深圳美甲" + 门店信息 → 5-8 分钟输出结果
3. **SSE 推送：** 前端能实时看到各阶段进度
4. **断点续跑：** 中断任务后重启，从失败阶段继续

### 运营验收（有用）

1. **对标准确率 > 70%：** 找出的 3-5 个对标中，至少 70% 是真正的同城商家自营号
2. **结论可追溯：** 每个分析结论都有 2-5 个来源笔记/评论/数据指标
3. **脚本可拍摄：** 生成的脚本有明确的拍摄清单、出镜人员、场景要求
4. **内容合规：** 生成内容不违反小红书社区规范和相关行业广告法规

### 人工评分 Rubric（对生成的脚本逐条评分）

对每条生成的脚本进行以下 5 维度评分，每项 1-5 分：

| 维度 | 1 分 | 3 分 | 5 分 |
|------|------|------|------|
| **选题清晰度** | 和门店业务无关 | 有相关性但泛化 | 精准命中门店差异化卖点 |
| **拍摄可行性** | 需要门店没有的资源/人员 | 基本可拍但需要额外准备 | 用门店现有素材/人员即可完成 |
| **门店差异化** | 和同行内容同质化 | 有一定差异但不够突出 | 清晰传达"为什么选这家不选别家" |
| **转化意图** | 无任何引导 | 有引导但生硬 | 自然引导到预约/咨询/到店 |
| **平台合规** | 违反社区规范 | 边缘地带 | 完全合规，符合社区调性 |

**通过标准：** 每条脚本总分 ≥ 20/25，全部脚本平均分 ≥ 22/25

## 范围边界（MVP 不包含）

- 30 天内容日历（后续迭代）
- 用户注册/登录系统
- 数据导出（PDF/Excel）
- 多项目管理
- 内容自动发布到小红书
- 付费功能/权限管理
- 图片/视频下载和商用
