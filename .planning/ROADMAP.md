# Roadmap: 小红书对标分析工具 (XHS Benchmark Agent)

## Overview

从零号阻塞项（Agent CLI 入口点）开始，逐步打通 Agent 执行、数据采集、端到端管道，然后按参考设计重做前端视觉和完善交互（保留已有数据流，不推倒重来），最后做 E2E 测试和稳定性收尾。五个阶段严格遵循依赖顺序。Phase 1 是当前真正的 blocker phase。

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Agent Core** - 修复关键阻塞项：CLI 入口点、JSON 安全、SQL 注入、Zod 验证、环境变量白名单
- [ ] **Phase 2: Data Collection** - 集成 xhs-mcp，连接小红书数据源，建立可靠的数据采集管道
- [ ] **Phase 3: Agent Pipeline** - 打通端到端执行：预算执行、产物验证、重试修复、超时处理
- [ ] **Phase 4: Frontend + SSE UX** - 按参考设计重做前端视觉和完善交互（保留已有数据流），同时加入 SSE 心跳和断线重连
- [ ] **Phase 5: E2E / Release Hardening** - 端到端自动化测试 + 部署前稳定性收尾

## Phase Details

### Phase 1: Agent Core
**Goal**: Agent Runner 可以被沙盒 spawn 并执行工具调用循环，不会因 JSON 解析错误崩溃，API 有输入验证。⚠️ 这是当前真正的 blocker phase — 没有 CLI 入口点，Agent 根本无法启动。
**Depends on**: Nothing (first phase)
**Requirements**: CORE-01, CORE-02, CORE-03, CORE-04, CORE-05, INFRA-02
**Success Criteria** (what must be TRUE):
  1. 通过 `JOB_ID` 环境变量或 `--job-id` 参数启动 Agent Runner，进程正常执行 runAgent() 并写入 timeline 日志
  2. 发送畸形 JSON 给 Agent Runner（模拟 LLM 返回非法 tool call 参数），进程不崩溃，记录解析错误并继续运行
  3. POST /api/jobs 收到非法请求体（缺少必填字段、mode 枚举值错误）时返回 400 + 明确错误信息，合法请求正常创建任务
  4. 沙盒子进程的环境变量只包含白名单条目（PATH, HOME, DATABASE_PATH, ZHIPU_API_KEY 等），不包含完整 process.env
  5. `data/` 目录和 `*.db*` 文件已被 .gitignore 排除，不会被提交到仓库
**Plans**: 2 plans

Plans:
- [ ] 01-01-PLAN.md -- CLI 入口点 + 安全加固（JSON.parse、SQL 白名单、环境变量白名单、gitignore）
- [ ] 01-02-PLAN.md -- POST /api/jobs Zod schema 验证

### Phase 2: Data Collection
**Goal**: Agent 能通过 xhs-mcp 搜索小红书笔记、获取用户资料、获取笔记详情，数据经过验证后进入分析流程
**Depends on**: Phase 1
**Requirements**: DATA-01, DATA-02, DATA-03, DATA-04, DATA-05, DATA-06
**Success Criteria** (what must be TRUE):
  1. Agent 调用 xhs_search 工具后，返回小红书搜索结果（至少包含笔记标题、作者、互动数据）
  2. Agent 调用 xhs_user_profile 工具后，返回用户资料（粉丝数、笔记数、头像）和笔记列表
  3. Agent 调用 xhs_get_note 工具后，返回笔记详情（正文内容、图片列表、点赞/收藏数）
  4. 每次 Agent 运行结束后，MCP 客户端连接关闭，无 Playwright 孤进程残留（进程数恢复到运行前水平）
  5. 任务启动前若 XHS 未登录，API 返回明确错误（"请先登录小红书"），而非在搜索时静默失败
**Plans**: TBD

### Phase 3: Agent Pipeline
**Goal**: 用户填表后，Agent 自主完成搜索到策略生成的全流程，产物经验证写入数据库，预算和错误在可控范围内
**Depends on**: Phase 2
**Requirements**: PIPE-01, PIPE-02, PIPE-03, PIPE-04, PIPE-05
**Success Criteria** (what must be TRUE):
  1. Agent 在搜索/分析/生成各环节遵守资源预算上限，超出预算时停止对应工具调用并记录（不会在搜索上花光所有预算）
  2. Agent 输出产物通过完整性检查：至少 3 个商家账号分析、每条结论有证据引用、至少 2 个脚本带拍摄清单
  3. LLM API 单次调用失败（超时/网络错误/格式异常）后自动重试（最多 3 次，指数退避），单次失败不导致整个任务崩溃
  4. 产物验证失败触发修复时，修复调用接收到当前产物内容 + 具体验证错误列表，而非从头重跑
  5. Agent 运行超过时限（fast 8min / deep 15min）后进程被终止，任务状态写入 "timeout" 错误
**Plans**: TBD

### Phase 4: Frontend + SSE UX
**Goal**: 按参考设计重做前端视觉和完善交互（保留已有数据流 StoreProfileForm/AgentTimeline/ResultPanel，不推倒重来），同时加入 SSE 心跳和断线重连
**Depends on**: Phase 3
**Requirements**: UI-01, UI-02, UI-03, UI-04, UI-05, UI-06, UI-07, UI-08, INFRA-01, INFRA-03
**Success Criteria** (what must be TRUE):
  1. 首页呈现暖色纸质风格（cream 背景、terracotta accent、ink 深色文字、硬件阴影按钮），视觉风格与参考页面一致
  2. 用户通过 5 步工作流指示器（基础信息 -> 经营定位 -> 优势素材 -> 内容偏好 -> 运行分析）逐步填写信息，每步有明确进度指示
  3. 表单页采用左右分栏布局：左侧 sticky 预览面板实时展示填写内容，右侧为表单卡片（含行业/城市选择器、chip 标签选择器、模式卡片）
  4. Agent 运行时显示时间线页面，按时间顺序展示工具调用进度（搜索中、分析中、生成中），配合暖色设计风格
  5. 结果页面分三个区域展示：账号分析卡片（商家评分、互动数据）、脚本拆解（标题公式、拍摄清单）、内容策略（7 天发布计划）
  6. SSE 端点每 15 秒发送心跳事件，防止代理服务器超时断开
  7. SSE 连接断开后前端自动重连，用户无需刷新页面即可恢复进度接收
**UI hint**: yes
**Plans**: TBD

### Phase 5: E2E / Release Hardening
**Goal**: 端到端自动化测试覆盖核心路径，部署前必要的稳定性收尾
**Depends on**: Phase 4
**Requirements**: INFRA-04
**Success Criteria** (what must be TRUE):
  1. 自动化测试覆盖核心路径：创建任务 -> Agent 执行完成 -> 产物写入数据库 -> 前端可查询展示结果
  2. 无已知 Critical/High severity 问题遗留
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Agent Core | 0/2 | Planned | - |
| 2. Data Collection | 0/? | Not started | - |
| 3. Agent Pipeline | 0/? | Not started | - |
| 4. Frontend + SSE UX | 0/? | Not started | - |
| 5. E2E / Release Hardening | 0/? | Not started | - |
