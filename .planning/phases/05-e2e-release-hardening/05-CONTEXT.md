# Phase 5: E2E / Release Hardening - Context

**Gathered:** 2026-05-04
**Status:** Ready for planning

<domain>
## Phase Boundary

端到端自动化测试覆盖核心路径 + 修复遗留 High 问题 + 手动验收，使系统达到可上线状态。具体：
- 核心路径集成测试（mock 外部 API）：创建任务 → agent 执行 → artifact 写入 → timeline events → 结果查询 API
- 单元测试补充高风险纯逻辑模块（artifact-validator、budget guard、tool registry）
- 修复 H-02（worker 竞争）、H-05（API 认证）、H-06（env 检查）
- 部署后手动 UI 验收（页面加载、表单提交、SSE 进度、结果展示）
- 完成标准：可上线（集成测试通过 + High 问题修复 + 手动验收 + 无 Critical/High 遗留）

</domain>

<decisions>
## Implementation Decisions

### 测试范围与策略
- **D-01:** 集成测试优先，范围收窄为"mock 外部 API 的核心路径集成测试"
- **D-02:** 集成测试覆盖：POST /api/jobs 创建任务 → mock agent/xhs-mcp/LLM → 验证 job 状态流转（queued → spawning → running → validating → completed）→ artifact 写入 → timeline events 生成 → GET /api/jobs/[id] 查询结果
- **D-03:** 单元测试只补高风险纯逻辑：artifact-validator（产物完整性校验规则）、budget guard（每资源预算检查）、tool registry（工具路由和参数验证）
- **D-04:** 真实 XHS 登录和手动 E2E 放在最后作为验收清单，不是自动化测试的一部分
- **D-05:** 测试框架用现有 Vitest，不引入新框架

### 遗留 High 问题修复
- **D-06 (H-02):** Worker 竞争修复 — 用 `claimNextJob()` 原子领取任务（SELECT → UPDATE WHERE status='queued' CAS 模式），即使当前单 worker 也修复，防止部署多实例时出问题
- **D-07 (H-05):** API 认证 — 加 MVP 级 shared secret header check（`x-api-key` header 与 `API_SECRET_KEY` env var 比对），所有 /api/jobs/* 路由都检查，无 key 返回 401
- **D-08 (H-06):** 环境变量检查 — worker 启动时检查必填 env vars（ZHIPU_API_KEY, DATABASE_PATH），缺一则打印明确错误并 exit(1)；Next.js 启动也在 next.config.ts 或 middleware 里加检查

### 部署与 UI 验收
- **D-09:** nginx no-cache header 已加（next.config.ts headers 配置），部署后手动清一次 nginx 缓存
- **D-10:** 手动验收检查清单：页面加载（BENCHMARK.AGENT hero + terminal mockup）→ 表单填写提交 → SSE 进度展示 → 结果页面展示 → 新任务重置
- **D-11:** Playwright UI 自动化不作为 Phase 5 必做项，除非手动验收发现回归

### 完成标准
- **D-12:** Phase 5 完成状态 = "可上线"：集成测试通过 + H-02/H-05/H-06 修复 + 手动 UI 验收通过 + 部署到服务器可用
- **D-13:** 允许存在低优先级 UI/体验问题，但不能有已知 Critical/High 风险遗留

### Claude's Discretion
- 集成测试的具体 mock 粒度（mock 整个 agent-runner 还是 mock 单个工具调用）
- shared secret 的具体 header 名和错误响应格式
- env 检查的具体代码位置（middleware vs next.config vs 独立检查模块）
- claimNextJob 的 SQL 实现细节（是否用事务）

</decisions>

<specifics>
## Specific Ideas

- 核心路径集成测试应该验证完整的 job 生命周期：queued → spawning → running → validating → completed，包括 error 路径
- claimNextJob() 应该是 db.ts 的新函数，替换 getNextQueuedJob()，用 CAS 模式防止竞争
- shared secret 检查应该放在 Next.js middleware 里，统一拦截所有 /api/* 路由
- worker 启动时 env 检查应该在 main() 函数最前面，任何其他逻辑之前

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 核心代码文件
- `src/lib/db.ts` — 数据库操作，需新增 claimNextJob() 函数
- `src/worker.ts` — Worker 进程，需改用 claimNextJob() + 加 env 检查
- `src/lib/agent-runner.ts` — Agent 主循环，集成测试需要 mock
- `src/lib/artifact-validator.ts` — 产物校验，单元测试目标
- `src/lib/tool-registry.ts` — 工具注册，单元测试目标
- `src/lib/types.ts` — Budget 类型定义，budget guard 测试需要

### API 路由
- `src/app/api/jobs/route.ts` — POST 创建任务，需加认证
- `src/app/api/jobs/[id]/route.ts` — GET 查询任务，需加认证
- `src/app/api/jobs/[id]/stream/route.ts` — SSE 流，需加认证

### 配置文件
- `next.config.ts` — 已有 headers 配置，可能加 env 检查
- `vitest.config.ts` — 测试配置，当前 passWithNoTests: true
- `src/middleware.ts` — 如不存在需新建，放 shared secret 检查

### 项目文档
- `.planning/codebase/CONCERNS.md` — 已知问题清单（H-02, H-05, H-06 为本 phase 修复目标）
- `.planning/codebase/TESTING.md` — 测试现状和推荐策略
- `.planning/phases/01-agent-core/01-CONTEXT.md` — Phase 1 决策（白名单、Zod schema 等）
- `.planning/REQUIREMENTS.md` — INFRA-04 需求定义
- `.planning/ROADMAP.md` — Phase 5 成功标准

### 设计文档
- `docs/superpowers/specs/2026-05-04-xhs-benchmark-tool-design.md` — 完整架构设计、Agent 运行流程、Artifact Contract、Sandbox Model

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/lib/schemas.ts` — Zod schema 已存在（CreateJobSchema），测试可以复用
- `src/lib/db.ts` — better-sqlite3 同步 API，测试可用内存模式（`:memory:`）
- `src/lib/xhs-client.ts` — MCP 客户端，集成测试需要 mock 整个模块

### Established Patterns
- Vitest 已配置（`passWithNoTests: true`），可直接写测试
- better-sqlite3 支持 `:memory:` 数据库，适合隔离测试
- Zhipu API 兼容 OpenAI SDK，mock `client.chat.completions.create` 即可
- SSE 端点已有心跳机制，测试需要验证 timeline events 格式

### Integration Points
- `db.ts:claimNextJob()` — 新函数，替换 `getNextQueuedJob()`，需要事务性 CAS
- `src/middleware.ts` — 新文件或修改已有文件，拦截 /api/* 路由加认证
- `worker.ts:main()` — 启动时加 env 检查，`process.exit(1)` 在缺少必填变量时
- `vitest.config.ts` — 移除 `passWithNoTests: true`（有测试后不再需要）

### Phase 1-4 已修复的问题（不需要重新修复）
- C-01 SQL 注入 → 已用白名单修复
- C-02 环境变量泄漏 → 已用白名单修复
- C-03 API 验证 → 已用 Zod 修复
- C-04 .gitignore → 已修复
- H-01 CLI 入口 → 已创建 src/bin/agent.ts
- H-03 MCP 重连 → 已修复
- M-01 预算执行 → 已修复
- M-02 LLM 重试 → 已修复
- M-08 修复上下文 → 已修复
- L-05 SSE 重连 → 已修复

</code_context>

<deferred>
## Deferred Ideas

- Playwright UI 自动化测试 — 如果手动验收发现回归再做
- H-04 双 LLM 提供商整合 — 当前架构可用，后续优化
- M-03 到 M-07 Medium 级问题 — 不阻塞上线
- S-01 速率限制 — shared secret 已提供基本保护，速率限制后续加
- S-02 第三方 MCP 包信任 — pin 版本后续做
- L-01 到 L-08 Low 级问题 — 持续改进

</deferred>

---

*Phase: 05-e2e-release-hardening*
*Context gathered: 2026-05-04*
