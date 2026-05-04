# Domain Pitfalls: AI Agent Competitive Analysis on Chinese Social Media

**Domain:** AI Agent + web scraping + LLM tool-use system for Xiaohongshu (XHS) competitive analysis
**Researched:** 2026-05-04
**Context:** Brownfield project with known issues (Agent Runner no CLI entry point, zero tests, no input validation, dual LLM providers, xhs-mcp not integrated, child process sandbox)

---

## Critical Pitfalls

Mistakes that cause rewrites or major system failures. Each includes warning signs, prevention, and phase mapping.

---

### P-01: Treating xhs-mcp (Browser Automation via Playwright) as a Reliable Data Source

**What goes wrong:** xhs-mcp uses Playwright headless browser to scrape Xiaohongshu. Browser-based scraping has a ~47% pass rate under stress testing (DigitalApplied MCP reliability study, 2026). The MCP server can fail silently, return partial data, get blocked by XHS anti-bot defenses, or timeout during rendering -- and the agent has no way to know the data is incomplete. The agent then analyzes garbage data and produces confident but wrong conclusions.

**Why it happens:** Developers test with small queries that work fine locally. In production, XHS rate-limits, CAPTCHAs, IP reputation checks, and signature verification create a cascade of failures. The agent loop calls `xhs_search`, gets back empty or partial results, and proceeds as if nothing is wrong. The MCP client singleton (CONCERNS.md H-03) compounds this: one transport failure permanently breaks all subsequent tool calls for the job.

**Consequences:** Agent produces competitive analysis reports based on missing or stale data. Users make business decisions on garbage. Silent failures are the worst kind because the output looks plausible but is wrong.

**Prevention:**
1. Validate every MCP tool response before passing to the agent. Check for empty results, error indicators, and minimum data completeness (e.g., search results must have at least `title` + `note_id`).
2. Add health-check + reconnection logic to the MCP client singleton (see CONCERNS.md H-03 fix).
3. Implement a "data sufficiency check" step before analysis: if search results are below a threshold, retry with different keywords or report insufficient data rather than producing a bad analysis.
4. Never cache failed or partial results -- current code caches results regardless of quality.

**Warning signs:**
- Agent timeline shows successful tool calls but artifact content is thin or generic
- Cache hit rate is high but analysis quality is low
- MCP tool returns results consistently under 3 seconds (likely cached/stale) or consistently times out

**Phase mapping:** Phase that integrates xhs-mcp must include response validation as a first-class concern, not a nice-to-have.

---

### P-02: LLM Tool-Calling Fragility with Zhipu GLM

**What goes wrong:** The agent relies on Zhipu GLM (glm-5-turbo) for tool calling via OpenAI-compatible SDK. Zhipu's tool calling has known limitations: 30-second idle timeouts that drop active tool_call responses (Vercel AI SDK #12949), non-standard thinking content formatting in some GLM models (AstrBot #5556), and reported errors on follow-up tool calls within the same conversation (Dify #5496). The agent loop parses `JSON.parse(toolCall.function.arguments)` without try/catch (CONCERNS.md M-03), meaning one malformed JSON argument from GLM crashes the entire job.

**Why it happens:** GLM's OpenAI compatibility layer is not a perfect match. The function calling format occasionally differs from what OpenAI SDK expects -- extra whitespace, non-standard escaping, missing fields. The project treats GLM as a drop-in replacement for GPT-4, but function calling reliability is measurably lower. In agent benchmarks, tool-related errors are one of the most frequent failure types (Atla AI, 2026).

**Consequences:** Agent crashes mid-execution with an unhandled JSON parse error. Partial artifacts are lost. The repair mechanism (CONCERNS.md M-08) is broken because it re-spawns without error context, so it will likely produce the same error again.

**Prevention:**
1. Wrap ALL `JSON.parse(toolCall.function.arguments)` calls in try/catch with structured error logging. This is already identified in CONCERNS.md M-03 but is phase-blocking -- it must be in the first phase that enables agent execution.
2. Add retry logic for individual tool call argument parsing failures (re-prompt the LLM with the error).
3. Use Zod to validate tool call arguments against the expected schema, not just JSON parse.
4. Test specifically with Zhipu GLM tool calling -- do not assume OpenAI SDK compatibility is perfect.

**Warning signs:**
- Agent jobs fail with `SyntaxError: Unexpected token` in logs
- Tool call arguments contain unexpected characters, missing fields, or wrong types
- GLM API returns 429 or 500 errors during multi-step agent runs

**Phase mapping:** Must be addressed in the same phase that adds the CLI entry point (CONCERNS.md H-01). Without JSON parse safety, the agent cannot run at all.

---

### P-03: Silent Agent Failures Masked by Exit Code 0

**What goes wrong:** The sandbox executor spawns a child process and checks exit code to determine success/failure. But the agent runner (CONCERNS.md H-01) currently has no CLI entry point -- when spawned, it imports the module and exits with code 0 without doing anything. Even after fixing the entry point, there are many ways the agent can "succeed" by exit code while producing no useful output: budget exhaustion early in the loop, LLM returning no tool calls, tool calls all returning errors that are swallowed.

**Why it happens:** The architecture conflates "process exited cleanly" with "agent produced useful results." These are fundamentally different things. The worker (CONCERNS.md M-08) attempts artifact validation after the sandbox exits, but validation is shallow and the repair mechanism has no error context. The credit assignment problem (Atla AI, 2026) makes it hard to determine which step caused the failure.

**Consequences:** Jobs show as "completed" in the UI but have no useful artifacts. Users see empty result pages. The system appears to work but delivers nothing of value.

**Prevention:**
1. After sandbox exits, validate that ALL expected artifacts exist AND contain meaningful data (not just that they parse as JSON).
2. Add an explicit "artifact completeness score" -- if it's below a threshold, mark the job as failed, not completed.
3. Log the agent's full execution trace (every LLM call, every tool call, every response) to the database so failures can be debugged after the fact.
4. Never use exit code alone as the success signal. Use artifact validation as the primary success metric.

**Warning signs:**
- Jobs complete in under 10 seconds (agent probably did nothing)
- Artifact JSON exists but has empty arrays or null fields
- Timeline events show the agent loop ran fewer than 3 iterations

**Phase mapping:** Address in the phase that enables end-to-end agent execution. Artifact validation must be robust before any user-facing release.

---

### P-04: Budget Controls That Track But Do Not Enforce

**What goes wrong:** The agent tracks per-resource budgets (maxSearches, maxProfiles, maxNotes) but never enforces them (CONCERNS.md M-01). The global tool call limit is the only real constraint. An agent can exhaust all searches in the first two iterations and then have no budget for profile lookups or note analysis, producing a report based entirely on search snippets.

**Why it happens:** Budget tracking was added as documentation, not as enforcement. Developers assumed the LLM would naturally distribute tool calls across categories. But LLMs do not plan budget allocation -- they react to immediate context. If search results are interesting, the agent keeps searching until the global limit hits.

**Consequences:** Unbalanced analysis. Lots of search data but no deep profile analysis. API credits wasted on redundant searches. The output is a glorified search summary, not a competitive analysis.

**Prevention:**
1. Add per-resource budget checks BEFORE tool execution (CONCERNS.md M-01 fix is correct -- implement it).
2. When a resource budget is exhausted, return a structured error to the LLM so it can adapt its strategy rather than silently failing.
3. Consider a two-phase approach: phase 1 searches (up to maxSearches), phase 2 profile lookups (up to maxProfiles), phase 3 analysis. This prevents the LLM from overspending on one category.

**Warning signs:**
- Agent uses 80%+ of budget on searches, 20% on profiles
- Budget JSON shows searches near limit but profiles/notes at 0-1
- Artifacts contain search result lists but no profile analysis or script breakdowns

**Phase mapping:** Address when implementing the agent execution loop. Budget enforcement is not optional -- it directly determines output quality.

---

### P-05: Child Process Orphaning During Deployment

**What goes wrong:** The worker process polls for jobs and spawns sandbox child processes. When pm2 restarts during deployment (CONCERNS.md L-08), the worker receives SIGTERM but has no mechanism to kill the active child process. The child becomes an orphan, continuing to run (or hang) while the job stays in "spawning" or "running" status in the database. The new worker process picks up a different job, and the orphaned process consumes server resources on the 2GB RAM machine.

**Why it happens:** Node.js child processes are not automatically killed when the parent exits unless `detached: false` is set AND the parent explicitly kills them on signal. The current SIGINT/SIGTERM handler sets `running = false` but does not track or terminate the active child. This is a well-documented Node.js pitfall (Node.js #33566, lerna #2284).

**Consequences:** Orphaned processes accumulate on the server. Each one holds a database connection and potentially an MCP browser session. On a 2GB RAM machine, 2-3 orphaned processes can cause OOM. Jobs stuck in "running" status are invisible to the user and never complete.

**Prevention:**
1. Track the active child process in a module-level variable.
2. On SIGTERM/SIGINT, kill the child process AND update the job status to "error" in the database.
3. On worker startup, scan for jobs in "spawning" or "running" status and reset them to "queued" (they were interrupted by a deployment).
4. Add `detached: false` to the spawn options (this is the default, but make it explicit).

**Warning signs:**
- `pm2 list` shows multiple node processes after several deployments
- Jobs stuck in "running" status for hours
- Server memory usage climbing after each deployment

**Phase mapping:** Address in the deployment/operations phase. Not blocking for MVP development but will cause production incidents.

---

### P-06: Dual LLM Provider Confusion (Zhipu + Claude)

**What goes wrong:** The project uses both Zhipu GLM API (for agent orchestration) and Claude/Anthropic SDK (for analysis tools). Two API keys must be configured. Two SDKs must be maintained. Two pricing models must be tracked. The `llm-config.ts` file is dead code (CONCERNS.md L-01), creating confusion about where configuration lives. Missing either API key causes failures at different stages with different error patterns.

**Why it happens:** The architecture started with one provider and added another incrementally. Nobody made a deliberate decision to use two providers -- it just happened. The Claude usage in `analysis.ts` may have been added for a specific capability that Zhipu couldn't provide at the time.

**Consequences:** Higher costs than necessary. Two failure modes instead of one. Developers are unsure which provider handles which task. CI/CD must deploy both sets of credentials (CONCERNS.md H-06).

**Prevention:**
1. Decide NOW: one provider or two? Document the decision and the rationale.
2. If keeping two: clearly separate responsibilities (e.g., Zhipu for agent orchestration/tool calling, Claude for deep analysis/summarization). Add this to the system prompt and architecture docs.
3. If consolidating to one: verify that Zhipu GLM-5 can handle all analysis tasks, then remove the Claude SDK dependency entirely.
4. Delete `llm-config.ts` dead code regardless of the decision.

**Warning signs:**
- New developers ask "which LLM does what?"
- Changes to one provider's config break unrelated features
- API costs are higher than expected for the volume of jobs

**Phase mapping:** Decide in the planning phase. The decision affects every subsequent phase.

---

## Moderate Pitfalls

---

### P-07: Data Freshness Illusion in Cached XHS Results

**What goes wrong:** The caching layer stores XHS search results for 1 hour and profile data for 24 hours (CONCERNS.md M-05). If a user runs analysis on the same industry+city combo within the cache window, they get stale data. On a platform like Xiaohongshu where content trends shift daily, a 24-hour-old profile analysis can miss recent viral posts, follower count changes, or content strategy pivots.

**Why it happens:** Caching was designed to avoid redundant API calls within a single job (good) but the TTLs are too long for cross-job reuse (bad). The agent has no mechanism to detect or communicate data staleness.

**Prevention:**
1. Differentiate TTLs: short within a job (2 hours for profiles), shorter for cross-job reuse.
2. Include a "data_as_of" timestamp in analysis artifacts so users know how fresh the data is.
3. Consider busting cache on explicit user request (e.g., "refresh analysis" button).

**Warning signs:** Analysis mentions specific follower counts or post counts that don't match current reality.

---

### P-08: Agent Loop Infinite Retry Without Progress

**What goes wrong:** The agent runs in a loop (LLM call -> tool calls -> results -> repeat). If the LLM keeps calling tools that return errors or empty results, the loop continues until the global tool call budget is exhausted. The agent never "gives up" gracefully or tells the user that it cannot find enough data. The job shows as "running" for minutes while the agent spins.

**Why it happens:** No progress detection in the agent loop. The only termination conditions are: budget exhaustion, max iterations, or an exception. There is no check for "have we made meaningful progress in the last N iterations?"

**Prevention:**
1. Track "productive" tool calls (those that return new, valid data) vs. "wasted" tool calls (errors, empty results, duplicates).
2. If 3+ consecutive tool calls produce no new data, break the loop and generate the best analysis possible with what you have.
3. Add a "stuck detection" heuristic: if the agent repeats the same tool call with similar arguments, force a strategy change.

**Warning signs:**
- Agent runs for 5+ minutes
- Timeline shows repeated tool calls to the same endpoint with similar arguments
- Budget shows high tool call count but low artifact completeness

---

### P-09: Repair Mechanism That Reproduces the Same Failure

**What goes wrong:** When artifact validation fails, the worker re-spawns the sandbox with identical inputs (CONCERNS.md M-08). The repair agent starts from scratch with no knowledge of what went wrong. If the failure was caused by insufficient data, an LLM parsing error, or a tool calling mistake, the repair attempt will produce the exact same failure.

**Why it happens:** The repair mechanism was designed as a simple retry, not as an informed correction. Error context is not passed to the repair agent. The system prompt is the same, the tool definitions are the same, the store profile is the same -- so the LLM will make the same decisions.

**Prevention:**
1. Pass validation errors to the repair agent via an environment variable or context file.
2. Modify the repair agent's system prompt to include: "The previous attempt failed with these errors: [errors]. Focus on fixing these specific issues."
3. If the repair also fails, do NOT retry again. Mark the job as failed with a clear error message.

**Warning signs:**
- Jobs show two sandbox spawns in the timeline with the same duration and the same failure
- Repair attempts always fail (100% repair failure rate)

---

### P-10: SQL Injection via Dynamic Column Names

**What goes wrong:** `updateJobStatus` constructs SQL by interpolating object keys as column names (CONCERNS.md C-01). While current callers use hardcoded keys, any future code that passes user-influenced data could inject SQL. This is classified as Critical in the codebase concerns.

**Prevention:** Implement the whitelist approach from CONCERNS.md C-01. This is a 10-minute fix that eliminates a critical vulnerability.

**Phase mapping:** Fix immediately in the first phase. No reason to delay.

---

### P-11: No Rate Limiting on Job Creation -- Unlimited API Cost Exposure

**What goes wrong:** The POST `/api/jobs` endpoint has no authentication or rate limiting (CONCERNS.md S-01, H-05). Each job consumes Zhipu + potentially Claude API credits. An attacker (or a buggy client) can create unlimited jobs, each costing real money in LLM API calls. Even a well-intentioned user refreshing the page could double-submit.

**Why it happens:** MVP-first thinking skipped auth. The API is open by design for simplicity. But the cost per job is non-trivial -- each job makes 10-30 LLM API calls plus MCP tool calls.

**Prevention:**
1. Add per-IP rate limiting to job creation (e.g., 5 jobs per hour per IP).
2. Add a simple shared-secret header check as minimum auth.
3. Consider a job queue limit (e.g., max 10 pending jobs globally on the 2GB server).

**Warning signs:**
- Unexpected spike in Zhipu API costs
- Job queue backing up with identical store profiles
- Server OOM from too many concurrent sandbox processes

---

### P-12: Environment Variable Leaks to Sandbox Child Process

**What goes wrong:** The sandbox executor spreads `...process.env` to the child process (CONCERNS.md C-02). This means ALL host environment variables -- including API keys, database paths, SSH keys from CI -- are available to the child process. The child runs xhs-mcp which downloads and executes an unpinned npm package (CONCERNS.md S-02). If that package is compromised, it has access to every secret on the server.

**Why it happens:** Convenience. Spreading process.env is the easiest way to pass environment variables. The security implication was not considered when the sandbox was designed.

**Prevention:**
1. Implement the explicit allowlist from CONCERNS.md C-02.
2. Pin the xhs-mcp package version (CONCERNS.md S-02).
3. Consider running the sandbox with reduced OS-level permissions (though this is limited on the 2GB server without Docker).

---

## Minor Pitfalls

---

### P-13: Prompt Engineering in TypeScript Source -- Slow Iteration Cycle

**What goes wrong:** The entire system prompt lives in a TypeScript template literal (CONCERNS.md L-07). Every prompt change requires a code change, rebuild, and redeploy. In an AI agent system, the prompt IS the product -- you iterate on prompts more than on code.

**Prevention:** Externalize the prompt to a markdown file or database field. Allow prompt changes without code deployment.

---

### P-14: Zero Test Coverage Means Zero Regression Safety

**What goes wrong:** The project has zero tests (CONCERNS.md L-02, T-01, T-02). Any change to scoring algorithms, budget tracking, validation rules, or API parsing can introduce regressions without detection. The CI test step always passes (`passWithNoTests: true`), providing false confidence.

**Prevention:** Start with unit tests for pure functions: `calculateScore()`, `validateJobArtifacts()`, `preFilterAccount()`, `parseResult()`. These are the functions most likely to break silently.

---

### P-15: SSE Connection Drops Leave Users Staring at a Spinner

**What goes wrong:** The SSE stream endpoint drops silently on error (CONCERNS.md L-05). The client calls `es.close()` without setting an error state or reconnecting. If the connection drops (network blip, server restart during deployment), the UI shows an agent that appears to run forever.

**Prevention:** Add reconnection logic with exponential backoff. On error, attempt to reconnect and fetch missed events.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation | Priority |
|-------------|---------------|------------|----------|
| Agent Runner CLI entry point | P-02: JSON parse crash on first tool call | Add try/catch + Zod validation before ANY agent logic runs | CRITICAL |
| xhs-mcp integration | P-01: Browser automation reliability ~47% | Validate every response, health-check MCP client, data sufficiency check | CRITICAL |
| Input validation (Zod) | P-10: SQL injection still open | Whitelist column names in updateJobStatus | HIGH |
| End-to-end agent execution | P-03: Silent success (exit 0, no artifacts) | Robust artifact validation, completeness scoring | HIGH |
| Budget enforcement | P-04: Tracking without enforcement | Per-resource budget checks before tool execution | HIGH |
| Deployment / operations | P-05: Orphaned child processes | Kill children on SIGTERM, reset stuck jobs on startup | MEDIUM |
| Dual LLM provider cleanup | P-06: Confusion about which LLM does what | Document decision, delete dead code | MEDIUM |
| Job creation API | P-11: Unlimited cost exposure | Rate limiting + basic auth | MEDIUM |
| Sandbox security | P-12: Env var leaks to child | Explicit env allowlist + pin xhs-mcp version | MEDIUM |
| Repair mechanism | P-09: Retry without error context | Pass validation errors to repair agent | MEDIUM |
| Agent loop control | P-08: Infinite retry without progress | Stuck detection, productive-call tracking | LOW |
| Prompt iteration | P-13: Slow prompt changes | Externalize prompts from TypeScript | LOW |
| Test coverage | P-14: No regression safety | Unit tests for pure functions first | LOW |
| SSE reliability | P-15: Connection drops silently | Reconnection logic with backoff | LOW |
| Data freshness | P-07: Stale cached XHS data | Shorter TTLs, data_as_of timestamps | LOW |

---

## Domain-Specific Anti-Patterns

These are patterns specific to building AI agent systems for Chinese social media competitive analysis that are almost always wrong.

### Anti-Pattern 1: "The LLM Will Figure It Out"

**What:** Giving the LLM a vague instruction like "analyze this competitor's content strategy" without structuring the analysis steps, data requirements, or output format.

**Why bad:** LLMs produce different analysis structures on every run. Without constraints, the output is inconsistent and cannot be validated programmatically. The agent will sometimes produce a 5-paragraph essay, sometimes a bullet list, sometimes a JSON object.

**Instead:** Define a strict output schema for each artifact type. Use the system prompt to enforce structure. Validate against the schema with Zod before accepting the artifact.

### Anti-Pattern 2: "Cache Everything, It's Faster"

**What:** Caching all XHS API responses with long TTLs to reduce API calls.

**Why bad:** Xiaohongshu content changes rapidly. Viral posts emerge in hours. Follower counts shift daily. Cached data from yesterday produces analysis that is confidently wrong about today's landscape.

**Instead:** Short TTLs (1-2 hours max for search, 4 hours for profiles). Always include timestamps. Bust cache when the user explicitly requests fresh analysis.

### Anti-Pattern 3: "One Big Prompt That Does Everything"

**What:** Writing a single monolithic system prompt that instructs the agent to search, analyze, score, and generate content all in one flow.

**Why bad:** The prompt becomes unmaintainable. The LLM gets confused about priorities. Changes to one analysis step require rewriting the entire prompt. The agent cannot adapt if one step fails.

**Instead:** Break the agent into clear phases (search -> filter -> analyze -> generate). Each phase has its own instructions and validation criteria. The agent loop naturally handles phase transitions through tool calls.

### Anti-Pattern 4: "Trust the MCP Tool Output Blindly"

**What:** Assuming that if xhs-mcp returns without throwing an error, the data is complete and correct.

**Why bad:** Browser automation returns what rendered on the page, which may be: an anti-bot CAPTCHA page (no error thrown), a login wall, a "no results" page that still has HTML structure, or partially loaded content (lazy loading). The MCP tool "succeeds" but returns garbage.

**Instead:** Validate the CONTENT of every MCP response: check for minimum expected fields, check for anti-bot indicators in the HTML, check for CAPTCHA markers. If validation fails, treat it as a tool error and retry or adapt.

---

## Sources

- [Klue: 6 Ways Generic LLMs Sabotage AI Builds for Competitive Intelligence](https://klue.com/blog/ai-competitive-intelligence-failures) -- Source weighting, data decay, context stripping, retrieval lottery, silent contradiction, no expert context. HIGH confidence. Published 2026-04.
- [Atla AI: Why LLM Agents Still Fail](https://atla-ai.com/post/why-llm-agents-still-fail) -- Agent fragility, credit assignment problem, tool use errors, non-reproducibility, benchmark vs reality gap. HIGH confidence. Published 2026.
- [arXiv: Why Do Multi-Agent LLM Systems Fail?](https://arxiv.org/html/2503.13657v3) -- Multi-agent failure analysis, superficial verification. MEDIUM confidence.
- [arXiv: Exploring Autonomous Agents - A Closer Look at Why They Fail](https://arxiv.org/html/2508.13143v1) -- Low task completion rates, root cause analysis. MEDIUM confidence.
- [Novada: playwright-mcp at Scale](https://www.novada.com/blog-ordinary/playwright-mcp-at-scale-why-your-browser-automation-breaks-and-how-to-stabilize-it/) -- Browser automation reliability, IP reputation, session handling, failure modes. HIGH confidence.
- [DigitalApplied: MCP Server Reliability 100 Server Stress Test](https://www.digitalapplied.com/blog/mcp-server-reliability-100-server-stress-test-study) -- 47% pass rate for browser-based tools. MEDIUM confidence (single study).
- [Zhipu AI Official Docs: Function Calling](https://docs.bigmodel.cn/cn/guide/capabilities/function-calling) -- Tool calling capabilities and limitations. HIGH confidence.
- [Zhipu AI: API Error Codes](https://docs.bigmodel.cn/cn/faq/api-issues) -- Rate limiting, concurrency limits, error codes. HIGH confidence.
- [Vercel AI SDK #12949](https://github.com/vercel/ai/issues/12949) -- 30s idle timeout drops tool_call. MEDIUM confidence (reported issue).
- [Dify #5496](https://github.com/langgenius/dify/issues/5496) -- Error on second function call with Zhipu GLM. LOW confidence (may be Dify-specific).
- [Cirra AI: GLM-4.6 Tool Calling & MCP Analysis](https://cirra.ai/articles/glm-4-6-tool-calling-mcp-analysis) -- GLM tool calling capabilities and Claude-to-GLM interoperability. MEDIUM confidence.
- [Node.js Child Process Docs](https://nodejs.org/api/child_process.html) -- Subprocess lifecycle, error handling. HIGH confidence.
- [Node.js #33566](https://github.com/nodejs/node/issues/33566) -- spawn() silent failure. HIGH confidence.
- Codebase Concerns (CONCERNS.md) -- Project-specific issues documented during codebase mapping. HIGH confidence (first-hand analysis).

---

*Pitfalls research: 2026-05-04*
