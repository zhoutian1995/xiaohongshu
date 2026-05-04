# Codebase Concerns

**Analysis Date:** 2026-05-04

---

## Critical

### C-01: SQL Injection via Dynamic Column Names in `updateJobStatus`

- **Files:** `src/lib/db.ts` lines 109-127
- **Issue:** The `updateJobStatus` function constructs SQL column names directly from object keys passed via the `extra` parameter. While the key `k` is not user-supplied directly, it is derived from `Object.entries(extra)` and interpolated into the SQL string as `${k} = ?`. Any caller that passes a key with special characters could cause SQL injection.
- **Impact:** Potential database corruption or data exfiltration if a malicious key is ever passed.
- **Current mitigation:** All current callers use hardcoded string keys (`'budget'`, `'started_at'`, `'error_message'`, `'completed_at'`). No user input flows into keys today.
- **Fix approach:** Whitelist allowed column names (`run_status`, `budget_json`, `started_at`, `completed_at`, `error_message`, `sandbox_pid`). Throw if an unknown key is passed. Example:
  ```typescript
  const ALLOWED_COLUMNS = new Set(['started_at', 'completed_at', 'error_message', 'sandbox_pid'])
  // In the loop:
  if (k === 'budget') { /* handle budget_json */ }
  else if (!ALLOWED_COLUMNS.has(k)) throw new Error(`Invalid column: ${k}`)
  ```

### C-02: Sandbox Executor Leaks Full Process Environment to Child Process

- **Files:** `src/lib/sandbox-executor.ts` lines 29-37
- **Issue:** The `env` object spreads `...process.env` and then overlays specific keys. This means every environment variable from the parent process (including any secrets, PATH customizations, shell configs) is passed to the sandboxed child process. The child runs `npx tsx src/lib/agent-runner.ts` which loads the same codebase.
- **Impact:** If the sandbox child is compromised (e.g., via a malicious MCP tool response), it has access to all host environment secrets including `ZHIPU_API_KEY`, `ANTHROPIC_API_KEY`, `SERVER_HOST`, `SSH_PRIVATE_KEY` (if set in CI), and any other env vars.
- **Fix approach:** Construct an explicit allowlist of environment variables for the child process instead of spreading `process.env`:
  ```typescript
  const SANDBOX_ENV_KEYS = ['PATH', 'HOME', 'NODE_ENV', 'DATABASE_PATH', 'XHS_MCP_DATA_DIR', 'ZHIPU_API_KEY', 'ZHIPU_BASE_URL', 'LLM_MODEL']
  const env: Record<string, string | undefined> = {}
  for (const key of SANDBOX_ENV_KEYS) {
    if (process.env[key]) env[key] = process.env[key]
  }
  ```

### C-03: No Input Validation on API Routes

- **Files:** `src/app/api/jobs/route.ts` lines 5-13, `src/app/api/jobs/[id]/route.ts` lines 4-22
- **Issue:** The POST endpoint only checks for the existence of `storeProfile` and `mode` fields but does not validate their content or structure. Any arbitrary JSON object passes through and gets stored in the database. The `mode` field is not validated against `'fast' | 'deep'`, meaning invalid modes silently default to `fast` mode limits (due to the ternary in `agent-runner.ts` line 24 and `worker.ts` line 44).
- **Impact:** Malformed store profiles cause the agent to produce garbage results or crash mid-execution. Invalid `mode` values silently degrade to fast mode behavior.
- **Fix approach:** Use Zod (already a dependency) to validate the request body:
  ```typescript
  import { z } from 'zod'
  const CreateJobSchema = z.object({
    storeProfile: z.object({ /* required fields */ }),
    mode: z.enum(['fast', 'deep']),
  })
  const body = CreateJobSchema.parse(await req.json())
  ```

### C-04: `data/` Directory and SQLite Database Not in `.gitignore`

- **Files:** `.gitignore`, `data/xhs.db`
- **Issue:** The `.gitignore` file does not exclude the `data/` directory. The SQLite database file (`data/xhs.db`) along with WAL files (`data/xhs.db-shm`, `data/xhs.db-wal`) are present on disk and could be accidentally committed. These contain job data, user store profiles, and cached XHS API responses.
- **Impact:** Accidental commit of production data including store profile PII (store names, addresses, business details) and cached third-party API responses.
- **Fix approach:** Add `data/` and `*.db*` to `.gitignore`:
  ```
  # database
  /data/
  *.db
  *.db-shm
  *.db-wal
  ```

---

## High

### H-01: Agent Runner Has No CLI Entry Point -- Sandbox Spawn Will Fail

- **Files:** `src/lib/agent-runner.ts`, `src/lib/sandbox-executor.ts` line 27
- **Issue:** The sandbox executor spawns `npx tsx src/lib/agent-runner.ts` as a child process. However, `agent-runner.ts` only exports the `runAgent()` function -- it has no top-level `main()` function, no `process.env.JOB_ID` check, and no `process.exit()` call. When tsx loads this file as a script, it will import the module, define the function, and immediately exit with code 0 without executing any agent logic.
- **Impact:** Every job will appear to "succeed" instantly with exit code 0, but no agent logic actually runs. No artifacts will be produced. The worker will proceed to validation which will fail, then attempt a repair which will also do nothing.
- **Fix approach:** Add a CLI entry point at the bottom of `agent-runner.ts`:
  ```typescript
  const jobId = process.env.JOB_ID
  if (jobId) {
    runAgent(jobId).then(() => process.exit(0)).catch(() => process.exit(1))
  }
  ```

### H-02: Worker Polling Race Condition -- Multiple Workers Could Pick Same Job

- **Files:** `src/worker.ts` lines 22-34, `src/lib/db.ts` line 130
- **Issue:** The `getNextQueuedJob()` function does a simple `SELECT ... WHERE run_status = 'queued' ORDER BY created_at ASC LIMIT 1` with no transactional locking. If multiple worker processes run (the deploy script restarts pm2 without guaranteeing old processes are dead first, lines 94-95), two workers can read the same queued job simultaneously before either updates its status.
- **Impact:** Duplicate agent execution for the same job, wasting API credits and producing conflicting artifacts.
- **Fix approach:** Use an atomic claim pattern with SQLite:
  ```typescript
  export function claimNextJob(workerId: string): any | undefined {
    const db = getDb()
    const row = db.prepare("SELECT * FROM jobs WHERE run_status = 'queued' ORDER BY created_at ASC LIMIT 1").get()
    if (!row) return undefined
    const updated = db.prepare(
      "UPDATE jobs SET run_status = 'spawning', sandbox_pid = ? WHERE id = ? AND run_status = 'queued'"
    ).run(process.pid, row.id)
    if (updated.changes === 0) return undefined // another worker claimed it
    return row
  }
  ```

### H-03: XHS MCP Client Singleton Never Reconnects on Failure

- **Files:** `src/lib/xhs-client.ts` lines 7-28
- **Issue:** The `getClient()` function caches the MCP client in a module-level `client` variable. If the MCP stdio transport process crashes or the connection drops, the cached `client` will be in a broken state. All subsequent tool calls will fail with transport errors, and there is no reconnection logic.
- **Impact:** A single MCP transport failure causes all remaining XHS tool calls for the entire job (and potentially future jobs in the same process) to fail permanently.
- **Fix approach:** Add connection health checking and reconnection:
  ```typescript
  async function getClient(): Promise<Client> {
    if (client) {
      try { await client.ping(); return client } catch { await disconnectXhs() }
    }
    // ... create new connection
  }
  ```

### H-04: Claude SDK Used Alongside Zhipu/OpenAI SDK -- Two Separate LLM Providers

- **Files:** `src/lib/claude.ts`, `src/lib/agent-runner.ts`, `src/lib/tools/analysis.ts`
- **Issue:** The project uses both `@anthropic-ai/sdk` (Claude) for analysis tools and `openai` (Zhipu GLM) for the agent orchestrator. The `claude.ts` module requires `ANTHROPIC_API_KEY`, while `agent-runner.ts` requires `ZHIPU_API_KEY`. Both API keys must be configured. The `llm-config.ts` file references Zhipu config but is never imported by any actual consumer -- it appears to be dead code.
- **Impact:** (1) Running costs from two separate LLM providers. (2) The `llm-config.ts` file is misleading dead code. (3) Missing either API key causes silent failures at different stages.
- **Fix approach:** Consolidate to a single LLM provider or document the dual-provider architecture clearly. Remove `src/lib/llm-config.ts` if unused (verify no imports).

### H-05: SSE Stream Endpoint Has No Authentication or Authorization

- **Files:** `src/app/api/jobs/[id]/stream/route.ts`, `src/app/api/jobs/[id]/route.ts`, `src/app/api/jobs/route.ts`
- **Issue:** All API endpoints are fully open with no authentication. Any user who knows (or guesses) a job ID can view timeline events, artifact data, and job details. The GET `/api/jobs` endpoint lists the last 20 jobs with IDs, making enumeration trivial. The POST endpoint allows anyone to create jobs that consume LLM API credits.
- **Impact:** Unauthorized job creation costs real money (Zhipu + Claude API calls). Unauthorized data access exposes store profile PII and competitive analysis results.
- **Fix approach:** Add authentication middleware. At minimum, add a simple API key or session-based auth check to all routes. For the MVP, a shared secret header check would be a significant improvement over nothing.

### H-06: CI/CD Pipeline Has No `.env` File Deployment Strategy

- **Files:** `.github/workflows/deploy.yml` lines 77-82
- **Issue:** The rsync deploy explicitly excludes `.env` files (`--exclude='.env'`). There is no step to create or update the `.env` file on the server. The application requires multiple environment variables (`ZHIPU_API_KEY`, `ANTHROPIC_API_KEY`, `DATABASE_PATH`, `XHS_MCP_DATA_DIR`, `LLM_MODEL`) to function. If the `.env` file on the server is missing or outdated, the application will silently use defaults or fail.
- **Impact:** Deployed application may crash or use wrong API keys after deployment if env vars are not manually maintained on the server.
- **Fix approach:** Add a step to sync environment variables via GitHub secrets, or at minimum validate that required env vars are set during the deploy step.

---

## Medium

### M-01: Budget Enforcement Is Post-Hoc, Not Preemptive

- **Files:** `src/lib/agent-runner.ts` lines 42-46, 89-91
- **Issue:** Budget checks happen at the start of each round (line 43: `if (budget.toolCallsTotal >= limits.maxToolCalls)`) but individual resource budgets (searches, profiles, notes) are only incremented after the tool call succeeds (lines 89-91). There is no check like `if (budget.searchesUsed >= limits.maxSearches)` before executing an `xhs_search` tool. The agent can exceed individual resource limits before the global tool call limit triggers.
- **Impact:** Individual resource limits (`maxSearches`, `maxProfiles`, `maxNotes`) are tracked but never enforced. They serve as documentation only.
- **Fix approach:** Add per-resource budget checks before tool execution:
  ```typescript
  if (toolCall.function.name === 'xhs_search' && context.budget.searchesUsed >= context.budgetLimits.maxSearches) {
    output = { error: 'Search budget exceeded' }
    status = 'budget_exceeded'
    break // or continue to next tool call
  }
  ```

### M-02: Agent Runner Has No Retry or Resilience for Transient LLM Failures

- **Files:** `src/lib/agent-runner.ts` lines 49-54
- **Issue:** The `client.chat.completions.create()` call has no retry logic. If the Zhipu API returns a 429 (rate limit), 500 (server error), or network timeout, the entire agent run fails immediately and the outer catch block (line 125) records a `job_error` timeline event. The job is lost with no way to resume.
- **Impact:** Transient network issues or API rate limits cause complete job failure. Jobs that have already consumed significant API credits and produced partial artifacts are abandoned.
- **Fix approach:** Add exponential backoff retry logic around the LLM call (e.g., retry up to 3 times with 2s/4s/8s delays for transient errors). Consider implementing a checkpoint/resume mechanism for the agent loop.

### M-03: `JSON.parse` Without Validation in Multiple Locations

- **Files:**
  - `src/lib/agent-runner.ts` line 77: `JSON.parse(toolCall.function.arguments)` -- LLM output parsed without try/catch
  - `src/lib/db.ts` lines 103-104: `JSON.parse((row as any).store_profile)` -- DB values parsed without try/catch
  - `src/lib/artifact-validator.ts` line 10: `JSON.parse(a.data_json)` -- artifact data parsed without try/catch
  - `src/components/ResultPanel.tsx` line 67: `JSON.parse(job.store_profile)` -- API response parsed without try/catch
- **Issue:** Multiple locations parse JSON strings without error handling. If the JSON is malformed (which is possible from LLM-generated tool arguments or corrupted database entries), the error will propagate as an unhandled exception.
- **Impact:** A single malformed JSON string crashes the entire agent run or renders the result page blank.
- **Fix approach:** Wrap all `JSON.parse` calls in try/catch blocks. For LLM output, validate against the expected schema using Zod. For database/API values, provide a fallback or error display.

### M-04: Rate Limiter Is Not Concurrency-Safe

- **Files:** `src/lib/rate-limiter.ts` lines 1-21
- **Issue:** The `RateLimiter` class uses a simple `lastCall` timestamp with no locking mechanism. In the Next.js server context, multiple concurrent requests could call `wait()` simultaneously and both read the same `lastCall` value before either updates it. This is especially relevant because the agent-runner runs tool calls in a sequential loop (safe), but if the architecture changes to support parallel tool calls, rate limiting would be ineffective.
- **Impact:** Currently low impact because tool calls are sequential in the agent loop. Will become a real bug if parallel tool execution is introduced.
- **Fix approach:** Use a mutex or queue-based rate limiter if concurrency is ever introduced. Document that the current implementation assumes single-threaded usage.

### M-05: XHS User Profile Tool Does Not Specify Cache TTL Explicitly

- **Files:** `src/lib/tools/xhs.ts` lines 38-47
- **Issue:** The `xhsUserProfileTool` calls `cache.setCache(cache.accountKey(input.userId), result)` without a TTL argument. This falls through to the default TTL of `ACCOUNT_TTL` (24 hours). However, the tool also checks for cached results before calling the API. The `xhsSearchTool` explicitly passes `cache.SEARCH_TTL` (1 hour), but `xhsUserProfileTool` relies on the default. This inconsistency suggests the caching strategy was not deliberately designed for each tool.
- **Impact:** User profile data is cached for 24 hours. If a user's profile changes during that window, the agent operates on stale data. For analysis that runs in minutes, a shorter TTL would be more appropriate while still avoiding redundant API calls within a single job.
- **Fix approach:** Consider using a shorter TTL (e.g., 2-4 hours) for profile data during active analysis, and document the caching strategy for each tool.

### M-06: `as any` Type Casts Suppress TypeScript Safety

- **Files:**
  - `src/lib/db.ts` lines 103-104, 177
  - `src/lib/agent-runner.ts` line 65
  - `src/lib/xhs-client.ts` line 111
- **Issue:** Multiple `as any` casts bypass TypeScript's type checking. In `db.ts`, the `getJob` function returns `any | undefined` and mutates the row in-place with casts. In `agent-runner.ts`, the OpenAI message is cast `as any` to push into the messages array. In `xhs-client.ts`, the MCP result is cast `as any` to access `.content`.
- **Impact:** Type errors at runtime that TypeScript cannot catch. Refactoring any of these interfaces will silently break without compile-time errors.
- **Fix approach:** Define proper return types for `getJob()`, use OpenAI's exported types correctly for the message array, and define an MCP result interface for the XHS client.

### M-07: `purgeExpired()` Called on Every `getCache()` -- Performance Impact

- **Files:** `src/lib/db.ts` lines 176, 186-188
- **Issue:** Every call to `getCache()` triggers `purgeExpired()` which executes `DELETE FROM cache WHERE expires_at <= datetime('now')`. During an active agent run with frequent tool calls, this DELETE runs on every cache lookup, including repeated lookups for the same key (which hit the early return on line 177).
- **Impact:** Unnecessary write operations on the database during read-heavy cache access patterns. In WAL mode, this causes additional WAL file churn.
- **Fix approach:** Rate-limit the purge operation (e.g., only purge once per minute) or move it to a background interval in the worker process.

### M-08: Repair Mechanism Re-Spawns Full Sandbox Without Error Context

- **Files:** `src/worker.ts` lines 67-79
- **Issue:** When artifact validation fails, the worker attempts a repair by calling `spawnSandbox()` again. However, it does not pass the validation errors to the agent. The agent has no way to know what failed or what to fix. The repair sandbox starts from scratch without any error context, making it extremely unlikely to produce valid artifacts on the second attempt.
- **Impact:** The repair mechanism is effectively broken. It re-runs the entire agent with the same inputs, which will likely produce the same (invalid) results.
- **Fix approach:** Pass validation errors to the repair agent via an environment variable or by creating a repair context file in the job's temp directory. Update the agent's system prompt to include the errors and instruct it to focus on fixing the specific issues.

---

## Low

### L-01: Dead Code -- `llm-config.ts` Never Imported

- **Files:** `src/lib/llm-config.ts`
- **Issue:** The `LLM_CONFIG` export is never imported by any file in the codebase. The actual LLM configuration lives in `agent-runner.ts` (lines 11-16) and `claude.ts` (lines 3-5). This file creates confusion about where configuration is centralized.
- **Impact:** Misleading for developers. If someone changes `llm-config.ts` expecting it to affect behavior, nothing changes.
- **Fix approach:** Delete `src/lib/llm-config.ts` or refactor `agent-runner.ts` and `claude.ts` to import from it.

### L-02: No Test Coverage -- `passWithNoTests: true`

- **Files:** `vitest.config.ts`, all of `src/`
- **Issue:** The Vitest configuration has `passWithNoTests: true`, and there are zero test files in the project. The CI pipeline runs `npm test` which will always pass. This means the test step in CI provides no value.
- **Impact:** No automated verification of any logic. Bugs in scoring algorithms, budget tracking, validation rules, and API parsing will only be caught in production.
- **Fix approach:** At minimum, add unit tests for: (1) `calculateScore()` in `analysis.ts`, (2) `validateJobArtifacts()` in `artifact-validator.ts`, (3) `preFilterAccount()` in `analysis.ts`, (4) `parseResult()` in `xhs-client.ts`, (5) budget tracking in `agent-runner.ts`. Remove `passWithNoTests: true`.

### L-03: TODO Comment in Page Component -- Error Handling Missing

- **Files:** `src/app/page.tsx` line 27
- **Issue:** The `handleSubmit` function catches errors with `// TODO: show error`. If the API call fails, the user sees no feedback. The `submitting` state remains `true` and the submit button stays disabled.
- **Impact:** Poor user experience on network errors or server failures. The form appears stuck.
- **Fix approach:** Add error state and display an error message to the user. Reset `submitting` to `false` in the catch block.

### L-04: Hardcoded Industry List in Frontend

- **Files:** `src/components/StoreProfileForm.tsx` line 6
- **Issue:** The `INDUSTRIES` array is hardcoded as `['美容美发', '餐饮', '健身', '医美', '教育', '零售', '其他']`. Adding a new industry requires a code change and redeployment.
- **Impact:** Inflexible for users whose industry is not in the list. They must choose "其他" (Other), which reduces the quality of AI analysis.
- **Fix approach:** Either make the industry list configurable (e.g., from a config file or API endpoint) or allow free-text input with autocomplete suggestions.

### L-05: SSE Connection Drops Silently on Error

- **Files:** `src/lib/use-job-stream.ts` line 44
- **Issue:** The `onerror` handler simply calls `es.close()` without setting any error state or attempting to reconnect. If the SSE connection drops (network blip, server restart), the timeline stops updating and the user sees a frozen state with the agent appearing to run forever.
- **Impact:** Users see an indefinitely spinning agent if the SSE connection is interrupted. No way to recover without refreshing the page.
- **Fix approach:** Add reconnection logic with exponential backoff. On error, attempt to reconnect and fetch missed events using the `after` parameter on the stream endpoint.

### L-06: `cacheKey` Uses Raw Keyword Without Sanitization

- **Files:** `src/lib/cache.ts` lines 19-20, `src/lib/tools/xhs.ts` line 18
- **Issue:** The cache key is constructed as `search:${keyword}` where `keyword` comes directly from LLM tool call arguments. Very long keywords or keywords with special characters could cause unexpected cache collisions or excessive memory usage.
- **Impact:** Unlikely in practice given the controlled LLM tool call context, but could theoretically cause cache key collisions or memory issues.
- **Fix approach:** Hash the keyword or normalize it before using as a cache key:
  ```typescript
  export function searchKey(keyword: string): string {
    return `search:${keyword.trim().toLowerCase().slice(0, 200)}`
  }
  ```

### L-07: Agent System Prompt Embedded in TypeScript -- Difficult to Iterate

- **Files:** `src/prompts/agent-system.ts`
- **Issue:** The entire system prompt is a template literal in a `.ts` file. This makes it difficult for non-developers to iterate on the prompt, and any prompt change requires a full rebuild and redeploy.
- **Impact:** Slower iteration on prompt engineering. No way to A/B test different prompts.
- **Fix approach:** Consider externalizing the prompt to a markdown file or database field. This would allow prompt changes without code changes.

### L-08: No Graceful Shutdown for Worker Process

- **Files:** `src/worker.ts` lines 13-20
- **Issue:** The SIGINT/SIGTERM handlers set `running = false` but the worker can be in the middle of `processJob()` which involves spawning a child process. Setting `running = false` only stops the polling loop after the current `processJob()` completes. There is no mechanism to abort a running sandbox process on shutdown.
- **Impact:** During deployment, the pm2 restart kills the worker process, which may leave an orphaned sandbox child process running. The job stays in `'spawning'` or `'running'` status indefinitely.
- **Fix approach:** Track the active child process and kill it on shutdown. Update the job status to `'queued'` or `'error'` so it can be retried:
  ```typescript
  let activeChild: ChildProcess | null = null
  process.on('SIGTERM', () => {
    activeChild?.kill('SIGTERM')
    // update current job status to 'error' with message 'Worker shutdown'
  })
  ```

---

## Security Considerations

### S-01: No Rate Limiting on Job Creation API

- **Risk:** The POST `/api/jobs` endpoint has no rate limiting. An attacker could create thousands of jobs, each consuming LLM API credits.
- **Files:** `src/app/api/jobs/route.ts`
- **Current mitigation:** None
- **Recommendations:** Add rate limiting (e.g., per-IP, per-session) or require authentication. Even a simple in-memory rate limiter would prevent abuse.

### S-02: Third-Party MCP Package Trust

- **Risk:** The XHS MCP client installs and runs `@sillyl12324/xhs-mcp@latest` via `npx -y` (see `src/lib/xhs-client.ts` line 12). This runs arbitrary code from an npm package on every worker start. The `@latest` tag means the code can change at any time without warning.
- **Files:** `src/lib/xhs-client.ts` line 12
- **Current mitigation:** None
- **Recommendations:** Pin to a specific version. Audit the package. Consider forking and maintaining a copy.

### S-03: `zod` Imported but Never Used for Validation

- **Risk:** Zod is listed as a dependency but never used. This is a missed opportunity to validate all untrusted inputs (API request bodies, LLM tool call arguments, MCP responses).
- **Files:** `package.json` (zod dependency), `src/app/api/jobs/route.ts` (no validation)
- **Current mitigation:** None
- **Recommendations:** Use Zod to validate: (1) API request bodies, (2) LLM tool call arguments before passing to handlers, (3) MCP response structures before parsing.

---

## Test Coverage Gaps

### T-01: Zero Test Coverage Across Entire Project

- **What's not tested:** All business logic
- **Files:** All files in `src/`
- **Risk:** Any change to scoring weights, validation rules, budget logic, or API parsing can introduce regressions without detection
- **Priority:** High for core logic (`artifact-validator.ts`, `analysis.ts` scoring), Medium for everything else

### T-02: No Integration Tests for Agent Flow

- **What's not tested:** The end-to-end flow of: job creation -> worker pickup -> sandbox spawn -> tool execution -> artifact validation
- **Files:** `src/worker.ts`, `src/lib/sandbox-executor.ts`, `src/lib/agent-runner.ts`
- **Risk:** The interaction between these components is the most complex part of the system and has zero test coverage
- **Priority:** Medium

---

*Concerns audit: 2026-05-04*
