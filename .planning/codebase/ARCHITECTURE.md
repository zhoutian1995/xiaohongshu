# Architecture

**Analysis Date:** 2026-05-04

## Pattern Overview

**Overall:** Controlled AI Agent with Sandbox Isolation

The system is a Next.js web application that orchestrates an autonomous AI Agent to perform Xiaohongshu (Little Red Book) competitive benchmark analysis for local businesses. The Agent runs inside a child process sandbox, autonomously calls tools (data collection, AI analysis, system operations), and produces structured artifacts that are validated and displayed to the user.

**Key Characteristics:**
- Agent autonomy with budget guardrails: The LLM Agent decides tool call order, but operates within strict budget limits and a max 50-round tool-use loop
- Two-process architecture: Next.js API server handles HTTP/SSE; a separate Worker process polls the database for queued jobs and spawns sandboxed Agent runs
- Artifact contract enforcement: The Agent must produce 4 specific artifact types; a validator checks completeness and triggers up to 1 repair cycle
- Real-time progress via SSE: Timeline events are written to SQLite and streamed to the browser via Server-Sent Events
- Dual LLM usage: ZhipuAI (GLM-5) for the main Agent tool-use loop; Anthropic Claude for secondary AI analysis tools

## Layers

**Presentation Layer (Frontend):**
- Purpose: User input, real-time progress display, and result rendering
- Location: `src/components/`, `src/app/page.tsx`
- Contains: React client components with three page states (idle form, running timeline, completed results)
- Depends on: API Routes via fetch and EventSource
- Used by: End user (browser)

**API Layer (Next.js API Routes):**
- Purpose: Job CRUD and SSE streaming
- Location: `src/app/api/jobs/`
- Contains: REST endpoints for job creation/retrieval and an SSE endpoint for timeline events
- Depends on: `src/lib/db.ts` for all database operations
- Used by: Presentation Layer

**Scheduling Layer (Worker):**
- Purpose: Background job orchestration -- polls for queued jobs, spawns sandbox, validates artifacts, handles repair
- Location: `src/worker.ts`
- Contains: Main event loop with SIGINT/SIGTERM handling, `processJob()` orchestration function
- Depends on: `src/lib/sandbox-executor.ts`, `src/lib/artifact-validator.ts`, `src/lib/db.ts`
- Used by: Run separately via `npm run worker`

**Agent Runtime Layer:**
- Purpose: LLM tool-use loop execution
- Location: `src/lib/agent-runner.ts`
- Contains: Message history management, LLM API calls, tool dispatch, budget tracking per round
- Depends on: `src/lib/tool-registry.ts`, `src/lib/db.ts`, `src/prompts/agent-system.ts`, OpenAI SDK (for ZhipuAI compatibility)
- Used by: Sandbox Executor (child process)

**Tool Layer:**
- Purpose: Concrete tool implementations the Agent can invoke
- Location: `src/lib/tools/xhs.ts`, `src/lib/tools/analysis.ts`, `src/lib/tools/system.ts`
- Contains: 8 tool definitions with JSON Schema inputs and async handlers
- Depends on: `src/lib/xhs-client.ts` (XHS data), `src/lib/claude.ts` (secondary AI), `src/lib/rate-limiter.ts`, `src/lib/cache.ts`, `src/lib/db.ts`
- Used by: Agent Runtime via `src/lib/tool-registry.ts`

**Data Layer:**
- Purpose: Persistent storage of jobs, artifacts, tool calls, timeline events, and cache
- Location: `src/lib/db.ts`, `data/xhs.db`
- Contains: SQLite schema, migrations, CRUD functions for all tables
- Depends on: `better-sqlite3`
- Used by: All layers except Presentation

## Data Flow

**Main Job Execution Flow:**

1. User fills `StoreProfileForm` and submits -> `POST /api/jobs` creates a job with `run_status='queued'`
2. Worker process polls `getNextQueuedJob()` every 2 seconds, picks up the job
3. Worker calls `spawnSandbox()` which spawns a child process running `agent-runner.ts` via `tsx`
4. `agent-runner.ts` loads the job from DB, builds system prompt with store profile, enters tool-use loop:
   - Calls ZhipuAI API with tool definitions
   - If LLM returns `tool_calls`, each is dispatched via `tool-registry.ts` to the appropriate handler
   - Tool results are appended to message history
   - Budget counters increment per tool type
   - Loop terminates when LLM returns no tool calls or budget is exhausted
5. Each tool call and progress event is recorded to `timeline_events` and `tool_calls` tables
6. Agent saves 4 artifact types via `save_artifact` tool: `benchmark_accounts`, `account_analysis`, `script_breakdown`, `content_strategy`
7. Sandbox exits; Worker runs `validateJobArtifacts()`:
   - Checks: at least 3 merchant accounts, evidence references per conclusion, at least 2 scripts with shooting checklists and reference notes, cross-artifact note ID integrity
   - If validation fails, Worker spawns another sandbox for repair (max 1 attempt)
8. Final status (`completed` or `error`) is written to DB; SSE streams terminal event to browser

**Real-Time Progress Flow:**

1. Browser opens `EventSource` to `GET /api/jobs/{id}/stream`
2. SSE endpoint reads initial `timeline_events` from DB, sends them immediately
3. Endpoint polls DB every 1 second for new events (by auto-incrementing `id > lastEventId`)
4. On `job_completed` or `job_error` event, the stream closes
5. Client-side `useJobStream` hook maps SSE events to React state, driving `AgentTimeline` component

**State Management:**
- Server-side: All job state lives in SQLite. The `budget_json` column tracks cumulative tool usage. The `run_status` column is the state machine: `queued -> spawning -> running -> validating -> (repairing -> validating) -> completed | error`
- Client-side: `page.tsx` manages a simple `PageState` machine: `idle -> running -> completed | error`. The `useJobStream` hook manages SSE connection lifecycle.

## Key Abstractions

**ToolDefinition:**
- Purpose: Uniform interface for all Agent-callable tools
- Examples: `src/lib/tools/xhs.ts`, `src/lib/tools/analysis.ts`, `src/lib/tools/system.ts`
- Pattern: Each tool exports a `ToolDefinition` object with `name`, `description`, `inputSchema` (JSON Schema), and `handler(input, context) => Promise<any>`. The `ToolContext` provides `jobId`, `mode`, `storeProfile`, `budget`, and `budgetLimits`.

**BudgetLimits:**
- Purpose: Constrain Agent resource usage per mode
- Examples: `FAST_MODE_LIMITS` and `DEEP_MODE_LIMITS` in `src/lib/types.ts`
- Pattern: Two preset configurations. Fast mode allows 6 searches, 50 tool calls, 80K tokens, 8-minute timeout. Deep mode doubles most limits with 15-minute timeout.

**Artifact Contract:**
- Purpose: Define what the Agent must produce; drive validation
- Examples: `benchmark_accounts`, `account_analysis`, `script_breakdown`, `content_strategy` in `src/lib/types.ts` (ArtifactType)
- Pattern: Agent calls `save_artifact` tool with a type enum and arbitrary JSON data. The validator in `src/lib/artifact-validator.ts` checks structural requirements per type.

**RateLimiter:**
- Purpose: Prevent API rate limit violations
- Examples: `src/lib/rate-limiter.ts`
- Pattern: Simple token-bucket-style limiter. `xhsLimiter` enforces 2-second intervals between XHS MCP calls; `claudeLimiter` enforces 1-second intervals between Claude API calls.

## Entry Points

**Web Application:**
- Location: `src/app/page.tsx` (Next.js App Router)
- Triggers: Browser HTTP requests
- Responsibilities: Renders the SPA with three mutually exclusive views (form, timeline, results)

**Worker Process:**
- Location: `src/worker.ts`
- Triggers: Manual start via `npm run worker` (or `tsx src/worker.ts`)
- Responsibilities: Infinite polling loop that picks up queued jobs, spawns sandbox, validates artifacts, handles repair, updates final status

**Agent Runner (Sandbox Entry):**
- Location: `src/lib/agent-runner.ts`
- Triggers: Spawned as child process by `sandbox-executor.ts`
- Responsibilities: Reads `JOB_ID` env var, loads job from DB, runs the LLM tool-use loop, writes all events and artifacts to DB

## Error Handling

**Strategy:** Layered with explicit error states in the job state machine

**Patterns:**
- **Sandbox isolation:** Agent crashes (exit code 1) do not affect the Worker process. The Worker catches the non-zero exit code and writes `run_status='error'` with a descriptive message.
- **Timeout handling:** `sandbox-executor.ts` sets a `setTimeout` for the configured timeout duration. On expiry, sends SIGTERM, waits 5 seconds, then SIGKILL if still alive. Exit code 2 signals timeout.
- **Tool-level errors:** Individual tool handler exceptions are caught in the agent-runner loop. The error is recorded as `status='error'` in `tool_calls` and returned to the LLM as a tool result, allowing the Agent to adapt.
- **Validation failure:** If artifacts don't pass validation, the Worker spawns a repair sandbox. If repair also fails, the job is marked `error` but existing artifacts are preserved.
- **Budget exceeded:** The agent-runner checks `budget.toolCallsTotal >= limits.maxToolCalls` before each LLM call. If exceeded, the loop breaks and a `job_error` timeline event is recorded.

## Cross-Cutting Concerns

**Logging:** Agent stdout/stderr is captured to `/tmp/xhs-agent/{jobId}/agent.log`. Worker logs to console with `[scheduler]` prefix. No structured logging framework.

**Validation:** Two types: (1) Input validation at the API route level (`storeProfile` and `mode` required). (2) Output validation via `artifact-validator.ts` checking artifact completeness, evidence references, and cross-artifact integrity.

**Authentication:** None. MVP has no user system. Jobs are accessible by ID (UUID).

**Rate Limiting:** `RateLimiter` class in `src/lib/rate-limiter.ts` enforces minimum intervals between external API calls (2s for XHS, 1s for Claude).

**Caching:** SQLite-backed cache table in `src/lib/cache.ts`. Search results cached for 1 hour; user profiles cached for 24 hours. Cache keys are prefixed (`search:`, `account:`).

---

*Architecture analysis: 2026-05-04*
