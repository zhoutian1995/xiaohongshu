# Requirements: 小红书对标分析工具

**Defined:** 2026-05-04
**Core Value:** Agent 能端到端跑通一次完整的对标分析流程，输出可执行的内容策略

## v1 Requirements

### Agent Core

- [ ] **CORE-01**: Agent Runner 拥有 CLI 入口点，读取 `JOB_ID` 环境变量并执行 `runAgent()`
- [ ] **CORE-02**: `agent-runner.ts` 中所有 `JSON.parse` 调用被 try/catch 包裹，解析失败返回错误而非崩溃
- [ ] **CORE-03**: `db.ts` 的 `updateJobStatus` 使用列名白名单验证，防止 SQL 注入
- [ ] **CORE-04**: `POST /api/jobs` 使用 Zod schema 验证请求体（storeProfile 结构 + mode 枚举）
- [ ] **CORE-05**: `sandbox-executor.ts` 使用环境变量白名单（PATH, HOME, DATABASE_PATH, ZHIPU_API_KEY 等），不泄漏完整 process.env

### Data Collection

- [ ] **DATA-01**: xhs-mcp 集成，Agent 能通过 `xhs_search` 工具搜索小红书笔记
- [ ] **DATA-02**: xhs-mcp 集成，Agent 能通过 `xhs_user_profile` 工具获取用户资料和笔记列表
- [ ] **DATA-03**: xhs-mcp 集成，Agent 能通过 `xhs_get_note` 工具获取笔记详情
- [ ] **DATA-04**: MCP 客户端有连接生命周期管理（连接、断开、重连），防止 Playwright 孤进程 OOM
- [ ] **DATA-05**: 每个 MCP 工具响应经过结构验证，不信任空/畸形数据
- [ ] **DATA-06**: 任务启动前有 XHS 登录状态预检，未登录时返回明确错误

### Agent Pipeline

- [ ] **PIPE-01**: Agent Runner 实现每资源预算执行（searches/profiles/notes 分别计数和限制）
- [ ] **PIPE-02**: 产物完整性验证至少检查：3+ 商家账号、每条结论有证据引用、2+ 脚本带拍摄清单
- [ ] **PIPE-03**: LLM API 调用有指数退避重试（最多 3 次），单次失败不崩溃整个任务
- [ ] **PIPE-04**: 修复沙盒接收当前产物 + 验证错误列表作为上下文，不盲目重跑
- [ ] **PIPE-05**: Agent 超时（fast 8min / deep 15min）正确终止并写入错误状态

### Frontend

- [ ] **UI-01**: 全局 CSS 变量定义暖色纸质风格主题（cream 背景、terracotta accent、ink 深色）
- [ ] **UI-02**: 5 步工作流指示器（基础信息→经营定位→优势素材→内容偏好→运行分析）
- [ ] **UI-03**: 左右分栏布局（左侧 sticky 预览面板 + 右侧表单卡片）
- [ ] **UI-04**: 表单组件：行业/城市选择器、chip 标签选择器、模式卡片（快速/深度）
- [ ] **UI-05**: Agent 运行时间线页面，配合新设计风格，显示工具调用进度
- [ ] **UI-06**: 结果展示页面：账号分析卡片、脚本拆解、内容策略
- [ ] **UI-07**: 硬件阴影按钮（box-shadow offset）、圆润输入框、响应式布局
- [ ] **UI-08**: 参考参考页面 `/Users/wille/Desktop/xiaohongshu_benchmark.html` 的视觉风格

### Infrastructure

- [ ] **INFRA-01**: SSE 端点每 15 秒发送心跳事件，防止代理超时断开
- [ ] **INFRA-02**: `data/` 目录和 `*.db*` 文件加入 `.gitignore`
- [ ] **INFRA-03**: 前端 SSE 客户端有断线重连逻辑
- [ ] **INFRA-04**: 基础端到端测试：创建任务→Agent 执行→产物写入→前端展示

## v2 Requirements

### Testing & Quality

- **TEST-01**: Agent Runner 单元测试（mock LLM API）
- **TEST-02**: Tool Registry 单元测试（参数验证、路由）
- **TEST-03**: API Routes 集成测试（Zod 验证、错误响应）
- **TEST-04**: MCP 通信 mock 测试

### Monitoring

- **MON-01**: 结构化日志替代 console.log
- **MON-02**: API 端点速率限制
- **MON-03**: 任务执行成本追踪（LLM API 用量）

### Browser Backend Spike

- [ ] **SPIKE-OBSCURA-01**: 验证 Playwright `connectOverCDP` 可连接 Obscura 并打开页面
- [ ] **SPIKE-OBSCURA-02**: 验证最小 XHS 页面访问、登录态保存和跨运行复用
- [ ] **SPIKE-OBSCURA-03**: 验证 xhs-mcp 是否能配置或改造为使用 Obscura CDP；如不能，明确最小改造范围
- [ ] **SPIKE-OBSCURA-04**: 对比 Obscura 与当前浏览器后端的内存占用、稳定性、成功率
- [ ] **SPIKE-OBSCURA-05**: 形成采用/不采用决策；只有全部 gate 通过才允许进入后续实现路线图

**Obscura spike gate:** 只有 `serve` 启动、Playwright CDP 连接、最小 XHS 登录/搜索/详情、session 复用、内存和稳定性对比全部通过，才考虑进入后续实现路线图。Obscura 不进入 v1 Phase 1-5 主线，也不解决当前 Phase 1-3 blocker。

## Out of Scope

| Feature | Reason |
|---------|--------|
| 用户认证系统 | MVP 无需，UUID 匿名访问够用 |
| 多平台支持（抖音/快手） | 专注小红书，避免平台 ToS 风险 |
| 自动发布功能 | 违反平台规则，法律风险 |
| 图片/视频生成 | 超出 MVP 范围，需要额外基础设施 |
| 实时监控仪表盘 | 单用户工具，轮询已够 |
| 移动端适配 | 先做桌面端 |
| Docker 容器化 | 2GB 服务器跑不了 Docker |
| Redis 队列 | SQLite 轮询对单用户足够 |
| Obscura 浏览器后端 | v2 Spike / Backlog 实验项；v1 继续使用 xhs-mcp 主路径 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| CORE-01 | Phase 1 | Pending |
| CORE-02 | Phase 1 | Pending |
| CORE-03 | Phase 1 | Pending |
| CORE-04 | Phase 1 | Pending |
| CORE-05 | Phase 1 | Pending |
| DATA-01 | Phase 2 | Pending |
| DATA-02 | Phase 2 | Pending |
| DATA-03 | Phase 2 | Pending |
| DATA-04 | Phase 2 | Pending |
| DATA-05 | Phase 2 | Pending |
| DATA-06 | Phase 2 | Pending |
| PIPE-01 | Phase 3 | Pending |
| PIPE-02 | Phase 3 | Pending |
| PIPE-03 | Phase 3 | Pending |
| PIPE-04 | Phase 3 | Pending |
| PIPE-05 | Phase 3 | Pending |
| UI-01 | Phase 4 | Pending |
| UI-02 | Phase 4 | Pending |
| UI-03 | Phase 4 | Pending |
| UI-04 | Phase 4 | Pending |
| UI-05 | Phase 4 | Pending |
| UI-06 | Phase 4 | Pending |
| UI-07 | Phase 4 | Pending |
| UI-08 | Phase 4 | Pending |
| INFRA-01 | Phase 4 | Pending |
| INFRA-02 | Phase 1 | Pending |
| INFRA-03 | Phase 4 | Pending |
| INFRA-04 | Phase 5 | Pending |

**Coverage:**
- v1 requirements: 28 total
- Mapped to phases: 28
- Unmapped: 0 ✓

---
*Requirements defined: 2026-05-04*
*Last updated: 2026-05-04 after initial definition*
