# External Integrations

**Analysis Date:** 2026-05-04

## APIs & External Services

**LLM - Zhipu GLM (Primary Agent LLM):**
- Purpose: Agent loop with tool calling for XHS benchmark analysis
- SDK/Client: `openai` npm package (v6.35.0) - uses OpenAI-compatible API interface
- Auth: `ZHIPU_API_KEY` env var (required)
- Base URL: `ZHIPU_BASE_URL` env var (defaults to `https://open.bigmodel.cn/api/coding/paas/v4`)
- Model: `LLM_MODEL` env var (defaults to `glm-5-turbo`)
- Usage: Agent orchestration loop in `src/lib/agent-runner.ts`, config in `src/lib/llm-config.ts`
- Function calling: Used for tool selection (search, profile, analysis, content generation)

**LLM - Anthropic Claude (Analysis LLM):**
- Purpose: Deep account analysis, script breakdown, content generation
- SDK/Client: `@anthropic-ai/sdk` npm package (v0.92.0)
- Auth: `ANTHROPIC_API_KEY` env var (required)
- Model: `claude-sonnet-4-20250514` (hardcoded default in `src/lib/claude.ts`)
- Usage: Called by `analyze_account`, `breakdown_scripts`, `generate_content` tools in `src/lib/tools/analysis.ts`
- Rate limited: 1-second minimum interval between calls (`claudeLimiter` in `src/lib/rate-limiter.ts`)

**XHS MCP (Xiaohongshu Data Collection):**
- Purpose: Search notes, fetch user profiles, get note details from Xiaohongshu
- Package: `@sillyl12324/xhs-mcp@latest` (run via `npx -y`)
- Protocol: Model Context Protocol (MCP) over stdio transport
- SDK/Client: `@modelcontextprotocol/sdk` (v1.29.0) in `src/lib/xhs-client.ts`
- Config: `XHS_MCP_DATA_DIR` env var (defaults to `~/.xhs-mcp`)
- Headless: Enabled (`XHS_MCP_HEADLESS=true`)
- Request interval: 2 seconds (`XHS_MCP_REQUEST_INTERVAL=2000`)
- Tools exposed:
  - `xhs_search` - Search notes by keyword
  - `xhs_user_profile` - Get user profile and notes
  - `xhs_get_note` - Get note details with security token
- Rate limited: 2-second minimum interval between XHS calls (`xhsLimiter` in `src/lib/rate-limiter.ts`)
- Caching: Search results cached 1 hour, user profiles cached 24 hours (`src/lib/cache.ts`)

## Data Storage

**Databases:**
- SQLite via `better-sqlite3` (v12.9.0)
  - Connection: `DATABASE_PATH` env var (defaults to `./data/xhs.db`)
  - Client: Direct synchronous driver in `src/lib/db.ts`
  - Journal mode: WAL (Write-Ahead Logging) for concurrent access
  - Foreign keys: Enabled
  - Schema: Auto-migrated on startup via `migrate()` function
  - Tables: `jobs`, `artifacts`, `tool_calls`, `timeline_events`, `cache`
  - Database file: `data/xhs.db` (with WAL files `xhs.db-shm`, `xhs.db-wal`)

**File Storage:**
- Local filesystem only
- Agent logs written to `/tmp/xhs-agent/{jobId}/agent.log` during sandbox execution
- No cloud file storage

**Caching:**
- SQLite-backed cache in `cache` table with TTL
  - Account profiles: 24-hour TTL
  - Search results: 1-hour TTL
  - Expired entries purged on read
  - Implementation: `src/lib/cache.ts`

## Authentication & Identity

**Auth Provider:**
- None (single-user tool, no user authentication)
- API keys stored as environment variables on the server
- No user login/session management

## Monitoring & Observability

**Error Tracking:**
- None (no Sentry, DataDog, or similar)
- Errors logged to console and stored in `timeline_events` table with `job_error` event type
- Job errors captured with `error_message` field in `jobs` table

**Logs:**
- Console output (stdout/stderr)
- PM2 process logs in production
- Agent execution logs in `/tmp/xhs-agent/{jobId}/agent.log`
- Timeline events stored in SQLite for job progress tracking

## CI/CD & Deployment

**Hosting:**
- Self-hosted Linux server
- Application path: `/home/admin/project/xiaohongshu/`
- Web server: Next.js on port 3002 via PM2 (`xiaohongshu-web`)
- Worker: tsx process via PM2 (`xiaohongshu-worker`)

**CI Pipeline:**
- GitHub Actions (`.github/workflows/deploy.yml`)
- Triggers: Push to `main` branch (excluding `chore: release v*` commits)
- Jobs:
  1. `bump-version` - Auto-increment patch version in `package.json`, commit and tag
  2. `test` - `npm install && npm test` on Node.js 20
  3. `deploy` - Build and deploy:
     - `npm install && npx next build --webpack`
     - rsync to server (excluding `data/` and `.env`)
     - SSH to restart PM2 processes
- Secrets used in CI:
  - `GITHUB_TOKEN` - Auto-provided, for version commit
  - `SERVER_HOST` - Target server hostname
  - `SERVER_USER` - SSH username
  - `SSH_PRIVATE_KEY` - SSH key for deployment

## Environment Configuration

**Required env vars:**
- `ZHIPU_API_KEY` - Zhipu GLM API key (agent orchestration)
- `ANTHROPIC_API_KEY` - Anthropic Claude API key (deep analysis)

**Optional env vars (with defaults):**
- `ZHIPU_BASE_URL` - defaults to `https://open.bigmodel.cn/api/coding/paas/v4`
- `LLM_MODEL` - defaults to `glm-5-turbo`
- `DATABASE_PATH` - defaults to `./data/xhs.db`
- `XHS_MCP_DATA_DIR` - defaults to `~/.xhs-mcp`

**Secrets location:**
- Server-side `.env` file (excluded from rsync deployment)
- GitHub repository secrets for CI/CD (`SERVER_HOST`, `SERVER_USER`, `SSH_PRIVATE_KEY`)
- No `.env` files tracked in git

## Webhooks & Callbacks

**Incoming:**
- None (no webhook endpoints)

**Outgoing:**
- None (no outgoing webhooks or callbacks)

## Real-Time Communication

**Server-Sent Events (SSE):**
- Endpoint: `GET /api/jobs/{id}/stream` in `src/app/api/jobs/[id]/stream/route.ts`
- Client hook: `useJobStream()` in `src/lib/use-job-stream.ts`
- Event types: `job_started`, `tool_called`, `tool_completed`, `artifact_saved`, `validation_passed`, `validation_failed`, `repair_started`, `job_completed`, `job_error`
- Polling: Server polls SQLite for new timeline events every 1 second
- Timeout: 15 minutes maximum connection duration
- Purpose: Real-time progress updates from agent execution to frontend

---

*Integration audit: 2026-05-04*
