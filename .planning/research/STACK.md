# Technology Stack

**Project:** 小红书对标分析工具 (XHS Benchmark Agent)
**Researched:** 2026-05-04
**Overall Confidence:** HIGH

---

## Recommended Stack

项目已有成熟的基础框架（Next.js 16 + React 19 + better-sqlite3），以下聚焦于**新增/需要强化的技术选型**，使其达到生产就绪状态。

### Core Framework (Already in Place - No Changes Needed)

| Technology | Version | Purpose | Confidence |
|------------|---------|---------|------------|
| Next.js | 16.2.4 | Full-stack React 框架 (App Router) | HIGH - 已在生产运行 |
| React | 19.2.4 | UI 渲染 | HIGH - 已稳定 |
| TypeScript | 5.x | 全栈类型安全 | HIGH - 已配置 strict mode |
| Tailwind CSS | 4.x | 样式系统 | HIGH - 已集成 |
| better-sqlite3 | 12.9.0 | SQLite 数据库驱动 | HIGH - WAL 模式已启用 |
| Node.js | 20.x | 运行时 | HIGH - CI 已固定版本 |

### LLM Providers (Already in Place - Recommend Consolidation)

| Technology | Version | Purpose | Confidence |
|------------|---------|---------|------------|
| openai (SDK) | 6.35.0 | Zhipu GLM API 客户端 (OpenAI 兼容模式) | HIGH - 已集成 |
| @anthropic-ai/sdk | 0.92.0 -> 0.93.0 | Claude 分析工具 (账号分析/脚本拆解/内容生成) | HIGH - 需要升级 |

**Recommendation:** 保持双 LLM 提供者架构。Zhipu GLM 用于 Agent 主循环（成本低、速度快），Claude 用于分析任务（质量高）。两者在代码库中已有明确分工，不建议统一。

### XHS Data Collection (Critical - MCP Integration)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| @sillyl12324/xhs-mcp | 2.7.0 | 小红书数据采集 MCP Server | 已在项目中集成，基于 Playwright 浏览器自动化 |
| @modelcontextprotocol/sdk | 1.29.0 | MCP 客户端通信 | 已通过 StdioClientTransport 连接 xhs-mcp |

**Why xhs-mcp over alternatives:**

| Alternative | Why Not |
|-------------|---------|
| Spider_XHS (Python) | Python 项目，与 TypeScript 代码库不兼容；无 MCP 协议支持；无法与 Agent 工具系统直接集成 |
| Puppeteer 直写 | 需要自己维护反检测、签名算法、Cookie 管理；xhs-mcp 已封装这些 |
| xhs-spider-mcp (npm) | 社区小众包，API 不如 ShunL12324/xhs-mcp 完整 |
| xpzouying/xiaohongshu-mcp (Go) | Go 语言实现，需要额外运行时；Node.js 生态兼容性差 |

**xhs-mcp 提供的关键工具（Agent 已使用）：**
- `xhs_search` - 关键词搜索笔记（核心需求）
- `xhs_user_profile` - 获取用户资料和笔记列表（核心需求）
- `xhs_get_note` - 获取笔记详情和评论（核心需求）
- `xhs_download_images` - 下载笔记图片（差异化功能）

**Confidence:** HIGH - 项目已编写 xhs-client.ts 集成代码，MCP SDK 连接模式已验证。

**注意事项：**
- xhs-mcp 需要浏览器登录（二维码扫码），服务器部署需考虑 headless 模式下的登录流程
- `XHS_MCP_HEADLESS=true` 已在代码中配置
- 需要预登录账号，会话存储在 `~/.xhs-mcp/data.db`

### Validation (Needs Implementation)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Zod | 4.4.3 | API 输入验证 + 工具参数验证 | 已在 package.json 中，但尚未使用；v4 支持 v3 兼容模式 |

**Why Zod over alternatives:**

| Alternative | Why Not |
|-------------|---------|
| Joi | 非类型安全，无 TypeScript 推断 |
| Yup | 较少维护，TypeScript 支持弱于 Zod |
| valibot | 生态太新，社区小，Zod v4 已解决 bundle size 问题 |
| io-ts | 函数式风格，学习曲线陡峭 |
| typebox | JSON Schema 优先，API 不如 Zod 直观 |

**Zod 4 关键改进（对比 v3）：**
- 更小的 bundle size（Zod 4 核心约 13KB vs Zod 3 约 14KB gzipped）
- 更好的错误消息格式化
- `z.partialRecord()` 支持非穷举 record
- 向后兼容 `import * as z from "zod"` 语法

**实施建议：**
```typescript
// API Route 验证示例
import { z } from "zod"

const CreateJobSchema = z.object({
  industry: z.string().min(1, "行业不能为空"),
  city: z.string().min(1, "城市不能为空"),
  targetAudience: z.string().min(1, "目标客群不能为空"),
  mode: z.enum(["fast", "deep"]).default("fast"),
})

// 从 schema 自动推断类型
type CreateJobInput = z.infer<typeof CreateJobSchema>
```

**Confidence:** HIGH - Zod 是 TypeScript 生态标准选择，项目已引入依赖。

### Testing (Needs Full Implementation)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Vitest | 4.1.5 | 测试框架 | 已在 package.json + vitest.config.ts 中，零测试文件 |

**Recommended Testing Additions:**

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @vitest/coverage-v8 | latest (同 vitest 版本) | 代码覆盖率 | CI 中强制覆盖率阈值 |
| @vitest/ui | latest (同 vitest 版本) | 测试结果可视化 | 开发时 `vitest --ui` |
| msw | 2.x | HTTP API Mock | 测试 LLM API 交互、MCP 通信 |

**Why Vitest over alternatives:**

| Alternative | Why Not |
|-------------|---------|
| Jest | 配置繁琐，与 ESM/TypeScript 兼容性差，Vitest 原生支持两者 |
| Node.js test runner | 功能太少，缺少 snapshot、mock、UI 等功能 |

**Why msw (Mock Service Worker):**

| Alternative | Why Not |
|-------------|---------|
| nock | 只支持 Node.js，API 较老 |
| axios-mock-adapter | 项目不使用 axios |
| 自写 fetch mock | 维护成本高，msw 已标准化 |

**msw vs 直接 mock：** 对于 LLM API 调用（Zhipu GLM、Claude），需要 mock HTTP 层面而非函数层面。msw 在 Node.js 测试环境中通过拦截 `fetch` 请求实现，不需要启动真实服务器。

**测试策略建议：**
```
1. Unit Tests (vitest) - 工具函数、验证 schema、数据转换
2. Integration Tests (vitest + msw) - Agent 工具执行、MCP 通信、DB 读写
3. E2E Tests (vitest) - API Route 完整流程（创建任务 -> 执行 -> 结果查询）
```

**Confidence:** HIGH - Vitest 已在项目中配置，MSW 是 Node.js 测试 mock 的标准选择。

### Agent / Worker Infrastructure (Already in Place)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| tsx | 4.21.0 | TypeScript 执行器 (Worker 进程) | 已用于 `src/worker.ts` |
| PM2 | latest | 进程管理 (生产环境) | 已部署 |

**缺失项：Agent Runner CLI 入口点**

当前 `sandbox-executor.ts` spawn 子进程但缺少 CLI 入口。需要添加：
```
src/cli/agent-runner.ts --job-id <uuid>
```

这个不是外部依赖，而是代码实现层面的问题。

### Utility Libraries (Already in Place)

| Library | Version | Purpose | Status |
|---------|---------|---------|--------|
| shadcn/ui | 4.6.0 | UI 组件库 | 已配置 |
| lucide-react | 1.14.0 | 图标库 | 已使用 |
| clsx + tailwind-merge | 2.1.1 / 3.5.0 | 条件类名合并 | 已使用 (cn()) |
| class-variance-authority | 0.7.1 | 组件变体管理 | 已使用 |

---

## What NOT to Add

| Technology | Why Avoid |
|------------|-----------|
| Prisma / Drizzle | SQLite 已经用 better-sqlite3 直连，ORM 对单文件 SQLite 是过度设计 |
| Docker | 2GB 服务器跑不了，项目已用子进程沙盒方案 |
| Redis | 单用户工具，不需要分布式缓存 |
| BullMQ / 队列系统 | Worker 已用轮询模式，复杂度不需要 |
| NextAuth / Clerk | MVP 无需用户系统，任务通过 UUID 访问 |
| Puppeteer | xhs-mcp 已内置 Playwright，不需要额外引入 |
| Playwright (直接) | xhs-mcp 封装了浏览器自动化，直接用 MCP 工具调用 |
| Google Fonts / 海外 CDN | 中国网络环境不可用，使用系统字体栈 |
| Vercel 部署 | 项目使用阿里云 + PM2，不支持 Vercel |

---

## Installation

```bash
# No new core dependencies needed - project already has all packages.

# Upgrade Anthropic SDK (minor version bump)
npm install @anthropic-ai/sdk@latest

# Testing additions (dev dependencies)
npm install -D @vitest/coverage-v8@latest
npm install -D msw@latest

# No need to install: Zod, Vitest, MCP SDK - already present
```

---

## Version Verification

All versions verified via `npm view` on 2026-05-04:

| Package | Verified Version | In package.json | Action |
|---------|-----------------|-----------------|--------|
| next | 16.2.4 | 16.2.4 | OK |
| react | 19.2.4 | 19.2.4 | OK |
| openai | 6.35.0 | ^6.35.0 | OK |
| @anthropic-ai/sdk | 0.93.0 | ^0.92.0 | Upgrade recommended |
| @modelcontextprotocol/sdk | 1.29.0 | ^1.29.0 | OK |
| @sillyl12324/xhs-mcp | 2.7.0 | (npx runtime) | OK |
| better-sqlite3 | 12.9.0 | ^12.9.0 | OK |
| zod | 4.4.3 | ^4.4.3 | OK |
| vitest | 4.1.5 | ^4.1.5 | OK |
| playwright | 1.59.1 | (via xhs-mcp) | OK |
| tsx | 4.21.0 | ^4.21.0 | OK |

---

## Confidence Assessment

| Area | Level | Reason |
|------|-------|--------|
| Core Framework | HIGH | 已在生产运行，版本验证通过 |
| XHS Data Collection (xhs-mcp) | HIGH | MCP 协议文档已查，集成代码已写，npm 版本已验证 |
| Validation (Zod) | HIGH | TypeScript 生态标准，v4 文档已查 |
| Testing (Vitest + msw) | HIGH | Vitest 已配置，msw 是社区标准 mock 方案 |
| LLM Providers | HIGH | 双提供者架构合理，npm 版本已验证 |
| No-add decisions | HIGH | 每个排除都有明确技术理由 |

---

## Sources

- [xhs-mcp GitHub (ShunL12324)](https://github.com/ShunL12324/xhs-mcp) - 功能列表、安装配置、环境变量
- [MCP TypeScript SDK GitHub](https://github.com/modelcontextprotocol/typescript-sdk) - Client API、StdioClientTransport 用法
- [Zod v4 Documentation](https://zod.dev) - Schema 定义、类型推断、v4 新特性
- [Vitest Documentation](https://vitest.dev) - 配置、测试模式、coverage
- [Spider XHS GitHub](https://github.com/cv-cat/spider_xhs) - Python 方案对比排除
- npm registry - 所有包版本号通过 `npm view` 实时验证
- Context7 - Zod v4 API、MCP SDK 客户端连接、Vitest 测试配置

---

*Stack research: 2026-05-04*
