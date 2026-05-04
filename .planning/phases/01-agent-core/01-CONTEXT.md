# Phase 1: Agent Core - Context

**Gathered:** 2026-05-04
**Status:** Ready for planning

<domain>
## Phase Boundary

修复 Agent Runner 的关键阻塞 bug，让沙盒能成功 spawn 并执行完整的工具调用循环。具体：
- Agent Runner 有独立 CLI 入口可被 spawn 执行
- JSON 解析安全，畸形 LLM 返回不崩溃
- 数据库列名白名单防 SQL 注入
- API 请求有 Zod schema 验证
- 沙盒环境变量不泄漏完整 process.env
- .gitignore 排除 data/ 和数据库文件

</domain>

<decisions>
## Implementation Decisions

### CLI 入口点设计
- **D-01:** 新建 `src/bin/agent.ts` 作为独立 CLI 入口文件，`agent-runner.ts` 保持纯导出可测试
- **D-02:** jobId 读取优先级：`--job-id` 命令行参数 > `process.env.JOB_ID`
- **D-03:** 缺少 jobId 时打印错误到 stderr 并 `process.exit(1)`
- **D-04:** runAgent 成功 `process.exit(0)`，异常捕获写 stderr 后 `process.exit(1)`
- **D-05:** `sandbox-executor.ts` 的 spawn 命令改为 `tsx src/bin/agent.ts --job-id <jobId>`

### 环境变量白名单
- **D-06:** `sandbox-executor.ts` 使用硬编码白名单，不展开 `...process.env`
- **D-07:** 白名单列表（10 个）：PATH, HOME, NODE_ENV, DATABASE_PATH, XHS_MCP_DATA_DIR, ZHIPU_API_KEY, ZHIPU_BASE_URL, LLM_MODEL, JOB_ID, JOB_MODE
- **D-08:** undefined 值不写入子进程环境变量（避免传出 "undefined" 字符串）
- **D-09:** 后续 xhs-mcp 如需额外变量，通过代码 review 显式加入白名单

### API 验证 Schema
- **D-10:** POST /api/jobs 使用 Zod 验证请求体
- **D-11:** 必填字段：`industry` (string), `city` (string), `storeName` (string)
- **D-12:** mode: `z.enum(['fast', 'deep'])`，默认 `'fast'`
- **D-13:** 可选字段带默认值：district('', priceRange('未提供'), targetAudience('未提供'), businessArea(''), specialties([]), realAdvantages([]), filmableAssets([]), onCamera(false), onCameraInfo(''), postFrequency('未提供'), existingAccount(''), forbiddenTopics([]), conversionMethod('私信咨询')
- **D-14:** 字段名统一使用 StoreProfile 类型现有命名：realAdvantages / filmableAssets / onCamera / postFrequency

### 其他
- **D-15:** `db.ts` 的 `updateJobStatus` 列名白名单：started_at, completed_at, error_message, sandbox_pid, budget_json（budget 特殊映射到 budget_json 列）
- **D-16:** `agent-runner.ts` 中 `JSON.parse(toolCall.function.arguments)` 用 try/catch 包裹，解析失败记录错误并返回错误 tool result

### Claude's Discretion
- agent.ts CLI 参数解析的具体实现方式（手动解析 process.argv 即可，不需要 commander/yargs）
- Zod schema 定义的具体文件位置（可以在 API route 文件内联或提取到 src/lib/schemas.ts）

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 核心代码文件
- `src/lib/agent-runner.ts` — Agent Runner 主循环，需理解 JSON.parse 位置和当前函数签名
- `src/lib/sandbox-executor.ts` — 沙盒 spawn 逻辑，需修改 env 传递方式和 spawn 命令
- `src/lib/db.ts` — 数据库操作，需修复 updateJobStatus 列名注入
- `src/app/api/jobs/route.ts` — API 路由，需加入 Zod 验证

### 类型和定义
- `src/lib/types.ts` — StoreProfile, Budget, BudgetLimits 等类型定义
- `.gitignore` — 需追加 data/ 和 *.db* 排除规则

### 研究参考
- `.planning/research/STACK.md` — 技术栈推荐（Zod 4.4.3 已在 package.json）
- `.planning/codebase/CONCERNS.md` — 已知问题清单（C-01 到 C-05, H-01）

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/lib/types.ts` — 已有 StoreProfile 类型定义，Zod schema 应与之对齐
- `src/lib/agent-runner.ts` — 已有 runAgent(jobId: string) 函数签名，CLI 入口直接调用

### Established Patterns
- `better-sqlite3` 同步 API — prepare().run() 模式
- OpenAI SDK function calling — tool_calls[].function.arguments 是 JSON 字符串需解析
- Next.js API Routes — NextRequest/NextResponse 模式

### Integration Points
- `sandbox-executor.ts:27` spawn 命令 — 需从 `tsx src/lib/agent-runner.ts` 改为 `tsx src/bin/agent.ts --job-id`
- `sandbox-executor.ts:29-38` env 对象 — 需从展开 process.env 改为白名单
- `agent-runner.ts:77` JSON.parse — 需 try/catch 包裹
- `db.ts:119` 列名插值 — 需白名单验证
- `api/jobs/route.ts:5-13` 请求验证 — 需替换为 Zod

</code_context>

<specifics>
## Specific Ideas

- sandbox-executor spawn 命令改为：`npx tsx src/bin/agent.ts --job-id ${jobId}`，同时传递 `--mode ${mode}`
- Zod 验证失败时返回 400 + 具体字段错误信息（不是笼统的 "invalid request"）
- .gitignore 追加：`/data/`, `*.db`, `*.db-shm`, `*.db-wal`

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-agent-core*
*Context gathered: 2026-05-04*
