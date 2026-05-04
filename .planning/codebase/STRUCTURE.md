# Codebase Structure

**Analysis Date:** 2026-05-04

## Directory Layout

```
xiaohongshu/
├── .claude/                        # Claude Code configuration
├── .github/workflows/              # CI/CD (deploy.yml)
├── data/                           # SQLite database (xhs.db + WAL files)
├── docs/superpowers/specs/         # Design and plan documents
├── public/                         # Static assets
├── src/
│   ├── app/                        # Next.js App Router pages and API
│   │   ├── api/jobs/               # Job REST API
│   │   │   └── [id]/               # Job detail + SSE stream
│   │   ├── globals.css             # Global styles (Tailwind)
│   │   ├── layout.tsx              # Root layout (zh-CN, full-height)
│   │   └── page.tsx                # Main SPA page (3-state machine)
│   ├── components/                 # React UI components
│   │   ├── ui/button.tsx           # shadcn/ui button
│   │   ├── AgentTimeline.tsx       # Real-time agent progress display
│   │   ├── ResultPanel.tsx         # Tabbed result view (accounts, analysis, scripts)
│   │   └── StoreProfileForm.tsx    # Store questionnaire form
│   ├── lib/                        # Core business logic and infrastructure
│   │   ├── tools/                  # Agent tool implementations
│   │   │   ├── xhs.ts             # XHS data tools (search, profile, note)
│   │   │   ├── analysis.ts        # AI analysis tools (account, scripts, content)
│   │   │   └── system.ts          # System tools (save_artifact, report_progress)
│   │   ├── agent-runner.ts         # LLM tool-use loop
│   │   ├── artifact-validator.ts   # Artifact completeness checker
│   │   ├── cache.ts               # SQLite-backed response cache
│   │   ├── claude.ts              # Anthropic Claude API helper (for analysis tools)
│   │   ├── db.ts                  # SQLite schema + CRUD
│   │   ├── llm-config.ts          # LLM env var configuration
│   │   ├── rate-limiter.ts        # Minimum-interval rate limiter
│   │   ├── sandbox-executor.ts    # Child process sandbox management
│   │   ├── tool-registry.ts       # Tool registration and dispatch
│   │   ├── types.ts               # All TypeScript type definitions
│   │   ├── use-job-stream.ts      # SSE client hook (React)
│   │   ├── utils.ts               # Tailwind cn() utility
│   │   └── xhs-client.ts         # XHS MCP SDK client
│   ├── prompts/
│   │   └── agent-system.ts        # Agent system prompt builder
│   └── worker.ts                  # Background job scheduler (separate process)
├── components.json                 # shadcn/ui configuration
├── eslint.config.mjs              # ESLint flat config
├── next.config.ts                 # Next.js config (default)
├── package.json                   # Dependencies and scripts
├── postcss.config.mjs             # PostCSS with Tailwind
├── tsconfig.json                  # TypeScript config with @/* path alias
└── vitest.config.ts               # Vitest config (passWithNoTests)
```

## Directory Purposes

**`src/app/`:**
- Purpose: Next.js App Router entry points (pages and API routes)
- Contains: One page (`page.tsx`), root layout, global CSS, and 3 API route handlers
- Key files: `src/app/page.tsx` (SPA state machine), `src/app/api/jobs/[id]/stream/route.ts` (SSE endpoint)

**`src/components/`:**
- Purpose: React UI components for the three page views
- Contains: Form component, timeline display, result panel, and one shadcn/ui primitive
- Key files: `src/components/StoreProfileForm.tsx` (272 lines, largest component), `src/components/ResultPanel.tsx` (255 lines, 3 tabs with sub-components)

**`src/lib/`:**
- Purpose: All non-UI logic: database, agent runtime, tools, caching, external API clients
- Contains: 16 TypeScript modules covering infrastructure, business logic, and agent tooling
- Key files: `src/lib/db.ts` (188 lines, schema + CRUD), `src/lib/types.ts` (184 lines, all type definitions), `src/lib/agent-runner.ts` (128 lines, LLM loop)

**`src/lib/tools/`:**
- Purpose: Agent tool implementations grouped by domain
- Contains: 3 files, 8 tools total (3 XHS data tools, 3 AI analysis tools, 2 system tools)
- Key files: `src/lib/tools/analysis.ts` (153 lines, includes scoring and prompt building)

**`src/prompts/`:**
- Purpose: Agent prompt templates
- Contains: Single file with the system prompt builder function
- Key files: `src/prompts/agent-system.ts` (84 lines, injects store profile and mode limits)

**`data/`:**
- Purpose: SQLite database storage
- Contains: `xhs.db` plus WAL/SHM files (auto-created by better-sqlite3 in WAL mode)
- Generated: Yes (auto-created on first DB access)
- Committed: Partially (the database file itself is not in `.gitignore`, but data is generated at runtime)

**`docs/superpowers/specs/`:**
- Purpose: Design and implementation plan documents
- Contains: Architecture design doc v3.0 and step-by-step implementation plan
- Key files: `docs/superpowers/specs/2026-05-04-xhs-benchmark-tool-design.md`

## Key File Locations

**Entry Points:**
- `src/app/page.tsx`: Browser SPA entry (Next.js renders this at `/`)
- `src/worker.ts`: Background scheduler process entry (run via `npm run worker`)
- `src/lib/agent-runner.ts`: Sandbox child process entry (spawned by sandbox-executor)

**Configuration:**
- `package.json`: Dependencies and npm scripts
- `tsconfig.json`: TypeScript settings with `@/*` path alias mapping to `./src/*`
- `next.config.ts`: Next.js config (currently default, no custom settings)
- `vitest.config.ts`: Test runner config
- `components.json`: shadcn/ui component config
- `src/lib/llm-config.ts`: LLM provider settings from env vars

**Core Logic:**
- `src/lib/types.ts`: All TypeScript interfaces, type aliases, and budget limit constants
- `src/lib/db.ts`: SQLite schema (5 tables), migrations, and all CRUD functions
- `src/lib/agent-runner.ts`: LLM tool-use loop (ZhipuAI via OpenAI SDK)
- `src/lib/sandbox-executor.ts`: Child process spawning with timeout and signal handling
- `src/lib/tool-registry.ts`: Tool lookup and OpenAI-compatible function definition generation
- `src/lib/artifact-validator.ts`: Multi-rule validation with cross-artifact integrity checks

**External API Clients:**
- `src/lib/xhs-client.ts`: XHS MCP SDK client (spawns `@sillyl12324/xhs-mcp` as stdio subprocess)
- `src/lib/claude.ts`: Anthropic Claude SDK wrapper for `askClaude()` and `askClaudeJSON()`

**Testing:**
- `vitest.config.ts`: Vitest configuration (no test files exist yet)

## Naming Conventions

**Files:**
- Components: PascalCase `.tsx` -- e.g., `StoreProfileForm.tsx`, `AgentTimeline.tsx`
- Library modules: kebab-case `.ts` -- e.g., `agent-runner.ts`, `xhs-client.ts`, `rate-limiter.ts`
- Tool modules: kebab-case `.ts` under `tools/` -- e.g., `xhs.ts`, `analysis.ts`, `system.ts`
- API routes: `route.ts` inside Next.js route directories -- e.g., `api/jobs/[id]/stream/route.ts`
- Prompt templates: kebab-case `.ts` -- e.g., `agent-system.ts`

**Directories:**
- App routes: kebab-case or `[param]` dynamic segments -- e.g., `api/jobs/[id]/stream/`
- Feature groups: kebab-case -- e.g., `tools/`, `prompts/`

**Exports:**
- Named exports for all modules (no default exports)
- Component names match file names: `StoreProfileForm.tsx` exports `StoreProfileForm`
- Tool definitions use const + descriptive name: `export const xhsSearchTool: ToolDefinition`

## Where to Add New Code

**New Agent Tool:**
- Implementation: `src/lib/tools/{domain}.ts` (create new file for new domain, add to existing for current domains)
- Registration: Add the tool export to the `ALL_TOOLS` array in `src/lib/tool-registry.ts`
- Type: Add tool-specific input/output types to `src/lib/types.ts` if needed

**New Artifact Type:**
- Type definition: Add to the `ArtifactType` union in `src/lib/types.ts`
- Validation rules: Add checks in `src/lib/artifact-validator.ts` (both per-artifact and cross-artifact)
- System prompt: Update `src/prompts/agent-system.ts` to mention the new artifact in the "must save" section
- UI rendering: Add a new tab or section in `src/components/ResultPanel.tsx`

**New Page/Route:**
- API route: Create `src/app/api/{resource}/route.ts` (or `src/app/api/{resource}/[id]/route.ts`)
- Page: Create `src/app/{page}/page.tsx`

**New Component:**
- UI component: `src/components/{ComponentName}.tsx`
- Reusable primitive: `src/components/ui/{name}.tsx` (shadcn/ui pattern, add via `npx shadcn add`)

**New Database Table:**
- Schema + migration: Add `CREATE TABLE IF NOT EXISTS` to the `migrate()` function in `src/lib/db.ts`
- CRUD functions: Add to `src/lib/db.ts` in a clearly commented section

**New LLM Provider:**
- Config: Add env vars to `src/lib/llm-config.ts`
- Integration: Modify `src/lib/agent-runner.ts` (currently hardcoded to ZhipuAI via OpenAI SDK) and/or `src/lib/claude.ts`

**Shared Utilities:**
- Generic helpers: `src/lib/utils.ts` (currently only `cn()`)
- Domain-specific helpers: Create a new file in `src/lib/` following kebab-case convention

**Tests:**
- Unit tests: Create `src/__tests__/{module}.test.ts` (directory does not exist yet, planned per design doc)
- Test config: `vitest.config.ts` at project root

## Special Directories

**`data/`:**
- Purpose: SQLite database files
- Generated: Yes (auto-created by `db.ts` on first access via `fs.mkdirSync`)
- Committed: Partially (not explicitly in `.gitignore`, but runtime-generated)

**`/tmp/xhs-agent/{jobId}/`:**
- Purpose: Per-job sandbox working directory with agent logs
- Generated: Yes (created by `sandbox-executor.ts`)
- Committed: No (in system temp directory)

**`.next/`:**
- Purpose: Next.js build output and cache
- Generated: Yes
- Committed: No (in `.gitignore`)

**`docs/superpowers/specs/`:**
- Purpose: Architecture and implementation plan documents
- Generated: No (manually authored)
- Committed: Yes

---

*Structure analysis: 2026-05-04*
