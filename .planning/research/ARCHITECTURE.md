# Architecture Patterns

**Domain:** AI Agent system for competitive social media analysis (Xiaohongshu benchmark tool)
**Researched:** 2026-05-04

## Recommended Architecture

The existing architecture follows sound patterns. This document validates current choices, identifies specific improvements, and maps each component to production-ready best practices.

### Current Architecture (Validated)

```
Browser (React SPA)
    |  POST /api/jobs  |  GET /api/jobs/{id}/stream (SSE)
    v                  v
Next.js API Routes -----------> SQLite (jobs, artifacts, timeline)
                                       ^
                                       | poll every 2s
Worker Process (src/worker.ts) --------+
    |
    | spawn child process
    v
Sandbox (agent-runner.ts)
    |  LLM API calls (Zhipu GLM-5)
    |  tool dispatch via tool-registry
    v
Tool Layer
    |-- xhs-client.ts --> MCP Client --> xhs-mcp (Playwright)
    |-- analysis.ts    --> Claude API (secondary AI)
    |-- system.ts      --> DB writes (artifacts, progress)
```

**Assessment:** The two-process (API + Worker) architecture with child-process sandbox isolation is the correct choice for this project's constraints (2GB RAM server, single-user MVP). The architecture is simpler than Docker-based approaches but provides sufficient isolation for an Agent that runs external API calls rather than arbitrary code.

---

## Component Boundaries

| Component | Responsibility | Communicates With | Current State |
|-----------|---------------|-------------------|---------------|
| **API Layer** | Job CRUD, SSE streaming | SQLite, Browser | Implemented, needs input validation |
| **Worker** | Job orchestration, artifact validation | SQLite, Sandbox Executor | Implemented, needs graceful shutdown |
| **Sandbox Executor** | Child process lifecycle, timeout enforcement | Worker (returns result) | Implemented, solid |
| **Agent Runner** | LLM tool-use loop, budget tracking | LLM API, Tool Registry, DB | Needs CLI entry point fix |
| **Tool Registry** | Tool dispatch, OpenAI format conversion | Agent Runner, Tool handlers | Implemented |
| **XHS Client** | MCP client to xhs-mcp server | xhs-mcp via stdio transport | Implemented, needs connection lifecycle management |
| **Rate Limiter** | Minimum interval enforcement | XHS Client, Claude client | Implemented, too simplistic |
| **Artifact Validator** | Structural completeness check | Worker, DB | Implemented, solid |
| **SSE Stream** | Real-time timeline events to browser | DB, Browser | Implemented, needs heartbeat |

### Data Flow Direction

```
User --> API --> DB --> Worker --> Sandbox --> Agent --> Tools --> DB
                      DB <-- Worker (validation)
Browser <-- SSE <-- DB (timeline events)
```

All data flows through SQLite as the single source of truth. No component reads from another component's memory or output files. This is correct and should be preserved.

---

## Architecture Decisions Analysis

### 1. Agent Sandbox: Child Process vs Docker vs WASM

**Recommendation: Keep child process sandbox. Upgrade to process-level restrictions.**

| Approach | Isolation | Overhead | Complexity | Fits 2GB Server |
|----------|-----------|----------|------------|-----------------|
| **Child Process (current)** | Weak (shares kernel, filesystem) | Near zero | Minimal | YES |
| **Docker Container** | Good (filesystem + network namespace) | 100-200MB per container | Medium | NO (too heavy) |
| **MicroVM (gVisor/Kata)** | Strong (kernel isolation) | 50-100MB | High | NO |
| **Interpreter-Level** | Minimal | Zero | Low | Partial |

**Why child process is correct here:**

The Agent does not execute arbitrary user-supplied code. It runs a controlled tool-use loop where all tool handlers are developer-defined functions. The threat model is LLM prompt injection causing unintended API calls, not arbitrary code execution. Child process isolation is sufficient because:

1. The Agent cannot spawn its own processes (no shell access in tools)
2. All external calls go through rate-limited, predefined handlers
3. Crash isolation is the primary need, not security isolation
4. The 2GB RAM constraint makes Docker impractical

**Recommended improvements to current sandbox:**

```typescript
// Add resource limits to child process spawn
const child = spawn('npx', ['tsx', 'src/lib/agent-runner.ts'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    JOB_ID: jobId,
    // Remove sensitive env vars from sandbox environment
    // Only pass what's needed
  },
  stdio: ['pipe', 'pipe', 'pipe'],
  // Add resource limits if available
  // detached: false ensures parent can kill child tree
})
```

Specific improvements:
- Strip unnecessary env vars from sandbox environment (keep only JOB_ID, DATABASE_PATH, ZHIPU_API_KEY, LLM_MODEL)
- Add memory monitoring: check `/proc/{pid}/status` for RSS and kill if exceeding threshold
- Kill entire process tree on timeout (use `detached: true` + `process.kill(-child.pid)`) to prevent orphaned MCP browser processes

**Confidence: HIGH** -- verified against [AI Agent Sandboxing Explained](https://www.softwareseni.com/ai-agent-sandboxing-explained-why-docker-is-not-enough-and-what-actually-works/), [Docker Agent Sandboxes](https://www.docker.com/blog/building-ai-teams-docker-sandboxes-agent/), and [interpreter-level sandboxing comparison](https://medium.com/@stawils/why-ai-agents-are-ditching-docker-for-interpreter-level-sandboxing-a078e886d49d)

---

### 2. MCP Protocol Integration Pattern

**Recommendation: Keep current MCP Client pattern via StdioClientTransport. Add connection lifecycle management.**

The current `xhs-client.ts` correctly uses the official MCP TypeScript SDK pattern:

```typescript
// Current pattern (correct)
const transport = new StdioClientTransport({
  command: 'npx',
  args: ['-y', '@sillyl12324/xhs-mcp@latest'],
})
const client = new Client({ name: 'xhs-benchmark-tool', version: '0.1.0' })
await client.connect(transport)
```

This follows the canonical MCP integration pattern documented at [modelcontextprotocol.io](https://modelcontextprotocol.io/docs/sdk) and [GitHub TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk).

**xhs-mcp package:** `@sillyl12324/xhs-mcp` (npm, MIT license, TypeScript, Playwright-based)
- Source: [github.com/ShunL12324/xhs-mcp](https://github.com/ShunL12324/xhs-mcp)
- Key tools needed: `xhs_search`, `xhs_get_note`, `xhs_user_profile` (read-only query tools)
- Runs headless Playwright browser for data collection
- Stores sessions in `~/.xhs-mcp/data.db` (SQLite)

**Critical issues to address:**

1. **MCP connection lifecycle:** The singleton `getClient()` pattern means the MCP server process (and its Playwright browser) stays alive across all tool calls within one agent run. This is efficient but:
   - Must call `disconnectXhs()` when agent run completes
   - Must handle MCP server crashes (Playwright can segfault)
   - Must re-connect if the MCP process dies mid-run

2. **Sandbox-MCP interaction:** The MCP client is created inside the sandbox child process. The xhs-mcp server spawns a Playwright browser. When the sandbox is killed (timeout), the MCP server and its browser must also be killed. Current code does not handle this -- risk of orphaned browser processes consuming server memory.

3. **Login state management:** xhs-mcp requires a logged-in Xiaohongshu session (QR code scan). This must be done outside the agent flow. The login state persists in `~/.xhs-mcp/data.db`. Need to verify login is valid before agent runs.

**Recommended MCP connection pattern:**

```typescript
// Per-agent-run connection with guaranteed cleanup
export async function withXhsClient<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const transport = new StdioClientTransport({
    command: 'npx',
    args: ['-y', '@sillyl12324/xhs-mcp@latest'],
    env: { /* minimal env */ },
  })
  const client = new Client(
    { name: 'xhs-benchmark-tool', version: '0.1.0' },
    { capabilities: {} }
  )
  try {
    await client.connect(transport)
    return await fn(client)
  } finally {
    await client.close() // kills the MCP server process
  }
}
```

**Confidence: HIGH** -- verified against [MCP official docs](https://modelcontextprotocol.io/docs/sdk), [xhs-mcp README](https://github.com/ShunL12324/xhs-mcp/blob/master/README.en.md), and official TypeScript SDK source

---

### 3. SSE/Real-Time Progress Streaming

**Recommendation: Keep current SSE pattern. Add heartbeat and structured event types.**

The current SSE implementation is a solid foundation. It follows the pattern recommended by [Shopify Engineering's SSE guide](https://shopify.engineering/server-sent-events-data-streaming) and matches Next.js's streaming support.

**Current pattern analysis:**

The SSE route (`src/app/api/jobs/[id]/stream/route.ts`) uses `ReadableStream` with `setInterval` polling (1s). The client uses `EventSource` API. This is correct for the use case.

**Issues with current implementation:**

1. **No heartbeat:** Long-running jobs (8-15 min) with no events will cause proxy/load-balancer timeout. Need periodic heartbeat events.

2. **Polling gap:** 1-second polling interval means up to 1s latency for new events. For agent tool calls that may take 200ms, this is acceptable. For user experience, could reduce to 500ms.

3. **No reconnection support:** If SSE connection drops, the client loses events. The `after` parameter exists but the `useJobStream` hook does not use `Last-Event-ID` for automatic reconnection.

4. **Memory leak risk:** `setInterval` in `ReadableStream.start()` is not guaranteed to be cleaned up if the controller closes between interval fires.

**Recommended SSE improvements:**

```typescript
// Add heartbeat every 15 seconds
let heartbeatInterval = setInterval(() => {
  if (!done) {
    controller.enqueue(encoder.encode(': heartbeat\n\n'))
  }
}, 15000)

// Use typed events matching AG-UI event categories
// (but simpler -- no need for full AG-UI protocol)
type AgentEvent =
  | { type: 'lifecycle'; subtype: 'started' | 'completed' | 'error' }
  | { type: 'tool_call'; tool: string; status: 'started' | 'completed' }
  | { type: 'artifact'; artifactType: string }
  | { type: 'progress'; message: string; percentage?: number }
```

**Why not WebSocket:** SSE is correct for this use case. The communication is strictly server-to-client (agent progress streaming). No bidirectional communication needed. SSE works over HTTP, survives proxy layers, and has native browser support via `EventSource`. WebSocket would add complexity with no benefit.

**Why not full AG-UI protocol:** [AG-UI](https://docs.ag-ui.com/concepts/events) defines 16-17 standardized event types for agent-UI interaction. This is overkill for the current MVP. The current event types (`job_started`, `tool_called`, `tool_completed`, `artifact_saved`, etc.) are sufficient. Consider adopting AG-UI if the UI needs text streaming (token-by-token) or multi-agent coordination in the future.

**Confidence: HIGH** -- verified against [Shopify Engineering SSE](https://shopify.engineering/server-sent-events-data-streaming), [Next.js streaming docs](https://nextjs.org/docs/app/building-your-application/routing/route-handlers#streaming), and [AG-UI event specification](https://docs.ag-ui.com/concepts/events)

---

### 4. Error Handling and Retry Strategy

**Recommendation: Add structured error classification, exponential backoff for tool calls, and circuit breaker for external APIs.**

**Current state:** The agent-runner catches tool errors and returns them to the LLM as tool results. This is the correct high-level pattern (let the Agent adapt). However, there is no retry logic for transient failures.

**Error taxonomy for this system:**

| Error Category | Example | Strategy | Current Handling |
|---------------|---------|----------|-----------------|
| **LLM API failure** | Zhipu API 500, rate limit | Retry with exponential backoff (3 attempts) | None -- crashes the loop |
| **Tool transient failure** | MCP timeout, network error | Retry with backoff (2 attempts) | None -- returns error to LLM |
| **Tool logical failure** | Invalid parameters, not found | Return to LLM (let it adapt) | Correct -- implemented |
| **Budget exceeded** | Max tool calls reached | Break loop, report | Correct -- implemented |
| **Sandbox timeout** | Agent exceeds time limit | SIGTERM + SIGKILL | Correct -- implemented |
| **Artifact validation failure** | Missing required artifacts | Repair cycle (1 attempt) | Correct -- implemented |
| **MCP process crash** | Playwright segfault | Reconnect MCP client | None |

**Recommended retry pattern for tool calls:**

```typescript
async function executeToolWithRetry(
  name: string, input: any, context: ToolContext, maxRetries = 2
): Promise<any> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await executeTool(name, input, context)
    } catch (err) {
      const isTransient = isTransientError(err)
      if (!isTransient || attempt === maxRetries) throw err

      const delay = Math.pow(2, attempt) * 1000 // 1s, 2s, 4s
      db.insertTimelineEvent(context.jobId, 'tool_retry',
        `${name} 失败，${delay}ms 后重试 (attempt ${attempt + 1}/${maxRetries})`)
      await sleep(delay)
    }
  }
}

function isTransientError(err: any): boolean {
  // Rate limits, timeouts, network errors, 5xx
  const msg = err.message?.toLowerCase() ?? ''
  return msg.includes('rate limit') || msg.includes('timeout') ||
         msg.includes('econnreset') || msg.includes('503') ||
         msg.includes('429')
}
```

**Recommended circuit breaker for XHS MCP calls:**

After 3 consecutive XHS MCP failures, stop retrying and fail the tool call immediately. This prevents wasting the Agent's budget on a broken MCP connection.

```typescript
class CircuitBreaker {
  private failures = 0
  private lastFailureTime = 0
  private readonly threshold = 3
  private readonly resetMs = 30_000 // 30 seconds

  get isOpen(): boolean {
    if (this.failures >= this.threshold &&
        Date.now() - this.lastFailureTime < this.resetMs) {
      return true
    }
    if (Date.now() - this.lastFailureTime >= this.resetMs) {
      this.failures = 0 // reset after cooldown
    }
    return false
  }

  recordFailure() {
    this.failures++
    this.lastFailureTime = Date.now()
  }

  recordSuccess() {
    this.failures = 0
  }
}
```

**LLM API retry:** The Zhipu GLM API call should be wrapped in retry logic with exponential backoff. If the LLM API is down, the entire Agent loop should wait, not crash.

```typescript
async function callLLMWithRetry(messages, tools, maxRetries = 3): Promise<ChatCompletion> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await client.chat.completions.create({ model, messages, tools })
    } catch (err) {
      if (attempt === maxRetries - 1) throw err
      const delay = Math.pow(2, attempt) * 1000 + Math.random() * 1000 // jitter
      await sleep(delay)
    }
  }
}
```

**Confidence: HIGH** -- patterns verified against [LangChain retry middleware](https://docs.langchain.com/oss/python/langchain/middleware/built-in), [agent retry strategies](https://docs.praison.ai/docs/best-practices/agent-retry-strategies), and [circuit breaker pattern](https://levelup.gitconnected.com/preventing-cascading-failures-in-ai-agents-179e29872646)

---

## Patterns to Follow

### Pattern 1: Explicit Agent State Machine

**What:** Define the Agent's lifecycle as an explicit state machine with named states, valid transitions, and per-state constraints.

**When:** Before adding more complexity to the Agent loop.

**Why:** The [agent state machine pattern](https://tianpan.co/blog/2026-04-20-agent-state-machines-before-llm-code) prevents the "spaghetti agent" problem where behavior is implicitly encoded in prompts and conversation history. Research found 42% of agent failures trace to system design issues without explicit state.

The current job state machine is already well-defined:
```
queued -> spawning -> running -> validating -> completed
                                       \-> repairing -> validating -> completed
                                                        \-> error
```

This is good. However, the Agent's internal execution loop has no state machine. Consider adding internal states to the agent-runner:

```
initializing -> searching -> profiling -> analyzing -> generating_artifacts -> done
```

This allows:
- Per-state tool availability (agent in `analyzing` should not call `xhs_search`)
- Per-state budget allocation (prevent overspending searches early)
- Better progress reporting (user sees "正在搜索" vs "正在分析")
- Easier debugging (know which state failed)

**Example implementation:**

```typescript
type AgentPhase = 'searching' | 'profiling' | 'analyzing' | 'generating' | 'done'

const PHASE_TOOLS: Record<AgentPhase, string[]> = {
  searching:  ['xhs_search', 'report_progress'],
  profiling:  ['xhs_user_profile', 'xhs_get_note', 'report_progress'],
  analyzing:  ['analyze_account', 'breakdown_scripts', 'report_progress'],
  generating: ['save_artifact', 'generate_content', 'report_progress'],
  done:       [],
}
```

### Pattern 2: Budget Allocation Per Phase

**What:** Divide the total budget across agent phases rather than having a single global budget.

**When:** When the Agent starts failing due to budget exhaustion before completing all phases.

**Example:**

```typescript
interface PhaseBudget {
  phase: AgentPhase
  maxToolCalls: number
  maxElapsedMs: number
}

const FAST_PHASE_BUDGETS: PhaseBudget[] = [
  { phase: 'searching',  maxToolCalls: 10, maxElapsedMs: 2 * 60 * 1000 },
  { phase: 'profiling',  maxToolCalls: 15, maxElapsedMs: 2 * 60 * 1000 },
  { phase: 'analyzing',  maxToolCalls: 10, maxElapsedMs: 2 * 60 * 1000 },
  { phase: 'generating', maxToolCalls: 15, maxElapsedMs: 2 * 60 * 1000 },
]
```

### Pattern 3: Artifact Contract as First-Class Concern

**What:** The Agent must produce specific artifact types with defined schemas. Validation is separate from Agent execution.

**When:** Always -- this is already implemented correctly.

The current pattern of `save_artifact` tool + `artifact-validator.ts` is a strong design. Key principle: the Agent proposes artifacts, the system validates them. The repair cycle (1 attempt) is appropriate for MVP.

**Improvement:** Add JSON Schema validation for each artifact type (not just structural checks). This catches malformed data early.

### Pattern 4: Write-Ahead Progress Logging

**What:** Record every significant action to the timeline before executing it, not after.

**When:** Already partially implemented. Ensure consistency.

The current pattern writes `tool_called` before execution and `tool_completed` after. This is correct. Extend this to LLM calls:

```typescript
// Before LLM call
db.insertTimelineEvent(jobId, 'llm_call_started', `调用 LLM (round ${round})`)

// After LLM call
db.insertTimelineEvent(jobId, 'llm_call_completed', `LLM 响应 (model: ${LLM_MODEL})`)
```

This gives the user visible progress even during slow LLM calls.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Singleton MCP Client Without Cleanup

**What:** Creating one MCP client that stays alive for the entire process lifetime.
**Why bad:** The MCP server spawns a Playwright browser. If the Agent crashes, the browser process becomes an orphan consuming memory on a 2GB server. Over multiple runs, this causes OOM.
**Instead:** Create MCP connection per agent run. Use `try/finally` to guarantee cleanup. Kill entire process tree on sandbox timeout.

### Anti-Pattern 2: Global Tool List for All Phases

**What:** Giving the Agent access to all 8 tools in every LLM call.
**Why bad:** The LLM may call tools out of order (e.g., analyze before searching). Research shows that restricting tools per state eliminates "entire categories of hallucinated tool use."
**Instead:** Phase-gate tool availability (see Pattern 1 above). This is an improvement to defer -- the current approach works for MVP but will become problematic as the Agent handles more complex tasks.

### Anti-Pattern 3: Silent Error Swallowing

**What:** Catching errors and logging them without propagating or retrying.
**Why bad:** The Agent appears to "hang" from the user's perspective. No timeline event, no error state, just silence.
**Instead:** Every catch block should write a timeline event. Every error should either be retried (transient) or surfaced to the LLM (logical) or surfaced to the user (fatal).

### Anti-Pattern 4: Blocking the Worker During Sandbox Execution

**What:** The Worker is single-threaded and blocks on `spawnSandbox()` until the sandbox completes.
**Why bad:** While one job runs, all other queued jobs wait. With a 15-minute deep mode job, this means up to 15 minutes of queuing.
**Instead:** For MVP with single-user, this is acceptable. If scaling to multiple concurrent users, run multiple Worker processes or use a job queue (BullMQ with SQLite). Not a priority now.

---

## Scalability Considerations

| Concern | At 1 user (current) | At 10 concurrent users | At production scale |
|---------|---------------------|----------------------|---------------------|
| **Worker concurrency** | 1 Worker, 1 job at a time | Multiple Worker processes | Job queue (BullMQ/Redis) |
| **Sandbox memory** | ~200MB per Agent run (MCP browser) | ~2GB total -- at server limit | Separate sandbox server |
| **SQLite write contention** | None (single writer) | Possible lock contention | Migrate to PostgreSQL |
| **SSE connections** | 1 connection | 10 connections -- fine | 100+ -- need connection manager |
| **XHS rate limiting** | 2s interval sufficient | Need per-account rotation | Multiple xhs-mcp instances |

**For this project's scope (single-user MVP on 2GB server):** The current architecture scales to approximately 2-3 concurrent users. Beyond that, the Worker needs to be multi-process and the MCP browser instances need separate infrastructure.

---

## Build Order Implications

Based on the architecture analysis, the recommended build order for remaining work:

1. **Agent Runner CLI entry point** (critical blocker) -- The sandbox spawns `agent-runner.ts` but it has no `main()` function. Without this, no agent runs.

2. **MCP connection lifecycle** -- The xhs-mcp integration needs guaranteed cleanup. Without this, server OOMs after multiple runs.

3. **LLM API retry logic** -- Without retry, a single Zhipu API 500 crashes the entire Agent run. High impact, simple fix.

4. **SSE heartbeat** -- Without heartbeat, long runs cause connection drops. Medium impact, simple fix.

5. **Tool retry + circuit breaker** -- Improves resilience for transient MCP failures. Medium impact, moderate effort.

6. **Agent phase state machine** -- Improves budget control and progress reporting. Higher effort, defer to post-MVP.

---

## Sources

- [MCP TypeScript SDK -- GitHub](https://github.com/modelcontextprotocol/typescript-sdk) (HIGH confidence)
- [MCP Protocol Specification -- modelcontextprotocol.io](https://modelcontextprotocol.io/docs/sdk) (HIGH confidence)
- [xhs-mcp README -- GitHub](https://github.com/ShunL12324/xhs-mcp/blob/master/README.en.md) (HIGH confidence)
- [Design Your Agent State Machine Before Prompts -- Tian Pan](https://tianpan.co/blog/2026-04-20-agent-state-machines-before-llm-code) (MEDIUM confidence)
- [LangChain Retry Middleware -- LangChain Docs](https://docs.langchain.com/oss/python/langchain/middleware/built-in) (HIGH confidence)
- [Next.js Streaming -- vercel/next.js](https://github.com/vercel/next.js/blob/canary/docs/01-app/02-guides/streaming.mdx) (HIGH confidence)
- [Shopify Engineering SSE](https://shopify.engineering/server-sent-events-data-streaming) (MEDIUM confidence)
- [AG-UI Event Specification](https://docs.ag-ui.com/concepts/events) (MEDIUM confidence)
- [AI Agent Sandboxing -- SoftwareSeni](https://www.softwareseni.com/ai-agent-sandboxing-explained-why-docker-is-not-enough-and-what-actually-works/) (MEDIUM confidence)
- [Building Retries in Agents -- Medium](https://rittikajindal.medium.com/building-retries-in-agents-how-to-build-ai-agents-that-survive-failures-32eedd2623f0) (MEDIUM confidence)
- [Preventing Cascading Failures in AI Agents](https://levelup.gitconnected.com/preventing-cascading-failures-in-ai-agents-179e29872646) (MEDIUM confidence)
- [Agent Retry Strategies -- PraisonAI](https://docs.praison.ai/docs/best-practices/agent-retry-strategies) (MEDIUM confidence)
