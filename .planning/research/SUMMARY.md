# Project Research Summary

**Project:** 小红书对标分析工具 (XHS Benchmark Agent)
**Domain:** AI Agent competitive analysis for Chinese social media (Xiaohongshu)
**Researched:** 2026-05-04
**Confidence:** HIGH

## Executive Summary

这是一个已部分搭建的 AI Agent 系统，帮助本地生活服务商家（美业、健身、餐饮）自动发现和分析同城小红书竞品账号，生成可执行的内容策略。项目采用 Next.js 16 + better-sqlite3 的全栈架构，通过 MCP 协议调用 xhs-mcp 采集小红书数据，使用 Zhipu GLM-5 驱动 Agent 主循环，Claude 处理深度分析任务。核心架构（Worker 轮询 -> 子进程沙盒 -> Agent 工具循环）已经就位，但 Agent 缺少 CLI 入口点、xhs-mcp 未实际集成、零测试覆盖，导致端到端流程无法跑通。

研究结论是：项目的架构选型和技术栈基本正确，不需要引入新框架。关键风险集中在三个方面：(1) xhs-mcp 浏览器自动化的可靠性（压力测试通过率仅约 47%），(2) Zhipu GLM 工具调用的稳定性（JSON 解析崩溃、30 秒超时断连），(3) Agent 安静失败（退出码 0 但无有效输出）。缓解策略是：对每个 MCP 响应做内容验证、对所有工具调用参数做 try/catch + Zod 校验、用产物完整性评分而非退出码判断成功。

建议的构建顺序严格遵循依赖关系：先修复 Agent Runner CLI 入口点和 JSON 解析安全 -> 集成 xhs-mcp 并添加响应验证 -> 实现 Agent 端到端执行和产物验证 -> 前端按参考设计重做 -> 添加测试和运维加固。

## Key Findings

### Recommended Stack

项目已有成熟的技术栈，不需要引入新的核心依赖。栈选型经验证全部合理：Next.js 16 + React 19 提供全栈能力，better-sqlite3 适合单用户 SQLite 场景，Zhipu GLM（低成本）+ Claude（高质量）的双 LLM 分工是正确的架构决策。唯一需要做的是升级 Anthropic SDK 到 0.93.0，以及安装 msw 用于测试 mock。

**Core technologies (no changes needed):**
- Next.js 16.2.4: 全栈框架 -- 已在生产运行
- better-sqlite3 12.9.0: SQLite 驱动 -- WAL 模式已启用，适合单用户场景
- Zhipu GLM-5 (via OpenAI SDK 6.35.0): Agent 主循环 LLM -- 成本低、速度快
- Claude (Anthropic SDK 0.92.0 -> 0.93.0): 深度分析 LLM -- 质量高
- xhs-mcp 2.7.0 (via MCP SDK 1.29.0): 小红书数据采集 -- 基于 Playwright 浏览器自动化
- Zod 4.4.3: 输入验证 -- 已引入但未使用，需要落地

**What NOT to add:**
- Prisma/Drizzle (SQLite 单文件不需要 ORM)、Docker (2GB 服务器跑不了)、Redis (单用户无需分布式缓存)、BullMQ (Worker 已用轮询模式)、NextAuth (MVP 无需用户系统)

### Expected Features

**Must have (table stakes -- 缺失则产品不可用):**
- Agent Runner CLI 入口点 -- 沙盒 spawn 后需要真正执行，当前是空跑
- XHS 数据采集（xhs-mcp 集成）-- 整个管道的阻塞依赖，没有真实数据一切下游都是空转
- 竞品账号发现与评分 -- 核心价值，scoring 算法存在但未端到端验证
- 实时进度展示 -- 已实现（AgentTimeline + SSE），需要 heartbeat 防断连
- 结构化分析结果展示 -- 需要按参考设计重做
- 脚本/文案生成 -- generate_content + breakdown_scripts 工具存在但未实测
- API 输入验证 -- Zod 已引入但零使用

**Should have (competitive differentiators):**
- 全自主 Agent 管道 -- 用户填表即获得策略，零运营知识要求，这是核心差异化
- 商家导向评分（非网红导向）-- 低粉丝高互动账号得分更高，市场独有
- 脚本拆解含拍摄清单 -- 不只写文案，还拆解标题公式、封面风格、钩子技巧
- 7 天发布计划 -- 从洞察到行动的桥梁
- 产物验证与自动修复 -- artifact-validator + repair cycle，确保输出质量

**Defer (v2+):**
- 话题池 UI、标签库 UI -- 数据已生成，UI 可以后补
- 任务历史列表页 -- UUID 访问对 MVP 够用
- 导出/报告生成 -- 截图够用

**Never build (anti-features):**
- 多平台支持（抖音/B站）、自动发布、实时监控、图片生成、用户认证、移动端适配

### Architecture Approach

项目采用两进程架构（Next.js API + Worker），通过子进程沙盒隔离 Agent 执行。SQLite 作为唯一数据源，SSE 实现服务端到客户端的进度推送。这个架构对 2GB 单用户场景是正确的选择：比 Docker 轻量，比单进程隔离更好。

**Major components:**
1. API Layer (Next.js Routes) -- 任务 CRUD、SSE 流推送，需要添加 Zod 输入验证
2. Worker (轮询进程) -- 任务编排、沙盒管理、产物验证，需要添加优雅关闭
3. Sandbox Executor (子进程) -- Agent 生命周期管理、超时强制终止，基本完善
4. Agent Runner (LLM 工具循环) -- 预算追踪、工具调度，缺少 CLI 入口点（关键阻塞项）
5. Tool Registry (8 个工具) -- xhs_search、xhs_user_profile、xhs_get_note 等工具的注册和分发
6. XHS Client (MCP 客户端) -- 通过 StdioClientTransport 连接 xhs-mcp，需要连接生命周期管理

**Key patterns to follow:**
- 产物合约作为一等公民：Agent 提议产物，系统验证产物，验证失败触发修复
- 写前进度日志：先记录 timeline 再执行操作，确保用户可见进度
- 每次运行独立 MCP 连接：避免浏览器进程泄漏，try/finally 保证清理

### Critical Pitfalls

1. **xhs-mcp 浏览器自动化可靠性低** -- 压力测试通过率约 47%。必须验证每个 MCP 响应的内容完整性，而非仅检查是否返回了数据。实施"数据充分性检查"步骤。

2. **Zhipu GLM 工具调用 JSON 解析崩溃** -- `JSON.parse(toolCall.function.arguments)` 无 try/catch，一个格式异常的参数就会崩溃整个任务。必须用 try/catch + Zod 双重保护，并在失败时重新提示 LLM。

3. **Agent 安静失败（退出码 0 但无产物）** -- 退出码不等于成功。必须用产物完整性评分作为成功判断标准，评分低于阈值则标记为失败。

4. **预算追踪但不执行** -- 每类资源有预算上限但从未强制执行。Agent 会在搜索上花光所有预算，导致没有预算做分析和生成。必须在工具执行前检查资源预算。

5. **子进程孤儿问题** -- pm2 重启时 Worker 接收 SIGTERM 但不终止活跃的子进程，导致内存泄漏。需要追踪子进程并在信号处理器中终止。

6. **环境变量泄漏到沙盒** -- `...process.env` 会将所有密钥传递给子进程（包括 xhs-mcp 下载执行的未固定版本 npm 包）。必须改为显式白名单。

7. **SQL 注入风险** -- `updateJobStatus` 通过对象键插值构造 SQL。虽然当前调用者用硬编码键，但必须加白名单防护。

## Implications for Roadmap

Based on research, suggested phase structure follows strict dependency order:

### Phase 1: Agent Core -- Make It Run
**Rationale:** Agent Runner 无 CLI 入口点是零号阻塞项。没有它，沙盒 spawn 后空跑退出，一切下游工作都无法进行。同时修复 JSON 解析安全（P-02）和 SQL 注入（P-10），这些是让 Agent 能跑起来的最低前提。
**Delivers:** Agent 可以被沙盒 spawn 并执行工具调用循环，不会因 JSON 解析错误崩溃。
**Addresses:** CLI entry point (H-01), JSON parse safety (M-03), SQL injection (C-01), API input validation (Zod)
**Avoids:** P-02 (GLM tool calling crash), P-10 (SQL injection), P-03 (silent exit 0)
**Key tasks:**
- 添加 `src/cli/agent-runner.ts --job-id <uuid>` 入口点
- 所有 `JSON.parse(toolCall.function.arguments)` 加 try/catch
- `updateJobStatus` 列名白名单
- POST `/api/jobs` 添加 Zod schema 验证

### Phase 2: Data Collection -- Connect to Reality
**Rationale:** 没有真实小红书数据，整个 Agent 管道是空转。xhs-mcp 集成是 FEATURE DEPENDENCY 图中的阻塞节点。必须同时解决 MCP 连接生命周期（防浏览器进程泄漏）和响应验证（防垃圾数据进入分析）。
**Delivers:** Agent 可以搜索小红书、获取用户资料、获取笔记详情，数据经过验证后进入分析流程。
**Addresses:** XHS data collection (blocker), MCP connection lifecycle (H-03), data validation
**Avoids:** P-01 (browser automation reliability), P-05 (orphaned processes -- partial)
**Key tasks:**
- 实现 `withXhsClient()` 连接模式（per-run connection + try/finally cleanup）
- 每个 MCP 响应内容验证（最少字段检查、反爬检测）
- 数据充分性检查（搜索结果低于阈值则重试或报告）
- pin xhs-mcp 版本，沙盒环境变量白名单（P-12）

### Phase 3: End-to-End Pipeline -- Close the Loop
**Rationale:** 前两个阶段让 Agent 能跑、能获取数据。这一阶段确保 Agent 能从数据采集到产物生成完整跑通，包括预算执行、产物验证、修复机制。
**Delivers:** 用户填表后，Agent 自主完成搜索 -> 分析 -> 评分 -> 脚本拆解 -> 内容策略生成全流程，结果写入数据库。
**Addresses:** Budget enforcement (M-01), artifact validation + repair, dual LLM provider clarity, error handling/retry
**Avoids:** P-03 (silent success), P-04 (budget without enforcement), P-06 (dual LLM confusion), P-08 (infinite retry), P-09 (repair without context)
**Key tasks:**
- 实现每资源预算执行（工具执行前检查）
- 产物完整性评分（低于阈值 = 失败）
- 修复机制传递验证错误上下文
- LLM API 重试逻辑（指数退避）
- 工具调用重试 + 熔断器
- 文档化双 LLM 分工决策
- Agent 循环"卡住检测"

### Phase 4: Frontend Redesign -- Match the Vision
**Rationale:** 前端按参考设计重做可以与后端并行开发（用 mock 数据），但最终集成需要真实 Agent 产出来验证展示效果。放在 Phase 3 之后确保有真实数据可展示。
**Delivers:** 暖色纸质风格的完整前端，含终端预览区、5 步工作流指示器、左右分栏布局、结果展示页（账号/分析/脚本三个 tab）。
**Addresses:** Frontend redesign (reference mockup), result display overhaul, SSE heartbeat
**Avoids:** P-15 (SSE connection drops)
**Key tasks:**
- 按参考设计重做首页（StoreProfileForm + 终端预览）
- 重做 Agent Timeline 进度页（配合新设计风格）
- 重做 ResultPanel 结果页（账号分析、脚本拆解、内容策略 tab）
- SSE heartbeat（15 秒间隔）+ 断线重连

### Phase 5: Test & Harden -- Ship It Safely
**Rationale:** 有了完整功能后，用测试和运维加固确保部署稳定。包括单元测试、集成测试、部署安全、速率限制。
**Delivers:** 测试覆盖核心路径、部署不会留下孤儿进程、API 有基本防护。
**Addresses:** Zero test coverage (L-02), deployment safety, rate limiting
**Avoids:** P-05 (child process orphaning), P-11 (unlimited API cost exposure), P-14 (no regression safety)
**Key tasks:**
- 单元测试：calculateScore、validateJobArtifacts、preFilterAccount、parseResult
- 集成测试：API Route 完整流程（msw mock LLM API）
- Worker SIGTERM 处理（终止子进程 + 更新任务状态）
- Worker 启动时重置卡住的任务
- Job 创建速率限制（per-IP）
- 端到端冒烟测试

### Phase Ordering Rationale

- Phase 1 在 Phase 2 之前：没有 CLI 入口点，Agent 无法执行，xhs-mcp 集成无从验证
- Phase 2 在 Phase 3 之前：没有真实数据，Agent 管道的分析/生成步骤无法端到端测试
- Phase 3 在 Phase 4 之前：前端展示需要真实 Agent 产出来验证设计
- Phase 4 可与 Phase 2-3 部分并行（用 mock 数据开发 UI 组件）
- Phase 5 在最后：功能稳定后再写测试，避免测试随接口变化反复重写

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 2:** xhs-mcp 的具体 API 行为和错误模式需要在集成时深入测试。文档不够详细，47% 通过率的数据需要自行验证。建议用 `/gsd-research-phase` 研究 xhs-mcp 工具的精确返回格式、错误类型和重试策略。
- **Phase 3:** Agent 循环的"卡住检测"和预算分配策略需要根据实际运行数据调优，无法纯靠研究预设。建议在 Phase 3 规划时用 `/gsd-research-phase` 研究 Agent 监控和自适应策略。
- **Phase 4:** 参考设计是 HTML 文件，需要分析其 CSS 架构并适配到 Next.js + Tailwind，可能需要研究具体的实现方案。

Phases with standard patterns (skip research-phase):
- **Phase 1:** CLI 入口点、JSON 解析安全、Zod 验证、SQL 白名单都是标准工程实践，无需额外研究。
- **Phase 5:** Vitest 测试、PM2 部署、速率限制都有成熟的文档和模式。

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | 所有依赖版本已通过 npm view 验证，架构已部分在生产运行，排除项有明确技术理由 |
| Features | MEDIUM | 竞品分析基于公开平台（QianGua、XinHong）和社区讨论，但目标用户（本地商家）的直接需求验证不足。功能依赖图基于代码库分析，可靠。 |
| Architecture | HIGH | 基于 MCP 官方文档、Next.js 文档、Shopify SSE 指南等高信源验证。当前架构评估基于对代码库的直接分析。 |
| Pitfalls | HIGH | 基于多个独立来源交叉验证（Atla AI、Klue、DigitalApplied、arXiv），且与代码库 CONCERNS.md 中的已知问题高度一致 |

**Overall confidence:** HIGH

### Gaps to Address

- **xhs-mcp 实际可靠性:** 47% 通过率来自单一压力测试（DigitalApplied），可能不反映本项目使用场景（低频、单用户）。需要在 Phase 2 集成时自行测试实际可靠性。
- **Zhipu GLM-5 工具调用精度:** 已知有 JSON 格式异常和超时问题，但具体的错误率和模式需要通过实际 Agent 运行来量化。
- **Prompt 工程:** 系统提示词是 Agent 行为的核心驱动，但提示词优化是经验驱动的，无法通过研究预设。需要在 Phase 3 端到端运行后迭代。
- **本地商家用户验证:** 竞品分析基于平台功能对比，但没有直接的用户访谈或可用性测试。功能优先级可能需要根据早期用户反馈调整。
- **双 LLM 成本模型:** Zhipu + Claude 的实际 API 成本需要通过若干次完整 Agent 运行来估算，用于后续定价决策。

## Sources

### Primary (HIGH confidence)
- MCP TypeScript SDK (GitHub) -- Client API、StdioClientTransport 用法
- xhs-mcp (GitHub/ShunL12324) -- 功能列表、安装配置、环境变量
- Zhipu AI Official Docs -- Function calling 能力和限制、API 错误码
- Next.js 16 Documentation -- Streaming、Route Handlers
- Zod v4 Documentation -- Schema 定义、类型推断
- Vitest Documentation -- 配置、测试模式
- Codebase direct analysis (CONCERNS.md) -- 所有项目特定问题
- Node.js Child Process Docs -- 子进程生命周期

### Secondary (MEDIUM confidence)
- Klue: 6 Ways Generic LLMs Sabotage AI Builds for Competitive Intelligence
- Atla AI: Why LLM Agents Still Fail
- Shopify Engineering: Server-Sent Events for Data Streaming
- Novada: playwright-mcp at Scale
- QianGua / XinHong / Sprout Social -- 竞品功能对比
- Zhihu / Woshipm -- 中文社区小红书运营痛点讨论

### Tertiary (LOW confidence)
- DigitalApplied: MCP Server Reliability Stress Test (47% pass rate -- 单一研究，可能不反映本项目场景)
- Vercel AI SDK #12949 (30s idle timeout -- 已报告 issue，可能已在后续版本修复)
- Dify #5496 (GLM 二次 function call 错误 -- 可能是 Dify 特定问题)

---
*Research completed: 2026-05-04*
*Ready for roadmap: yes*
