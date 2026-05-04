# Coding Conventions

**Analysis Date:** 2026-05-04

## Naming Patterns

**Files:**
- React components: PascalCase, co-located in `src/components/` -- e.g. `StoreProfileForm.tsx`, `AgentTimeline.tsx`, `ResultPanel.tsx`
- UI primitives (shadcn): PascalCase in `src/components/ui/` -- e.g. `button.tsx`
- Library modules: kebab-case in `src/lib/` -- e.g. `xhs-client.ts`, `rate-limiter.ts`, `agent-runner.ts`
- Tool definitions: kebab-case in `src/lib/tools/` -- e.g. `xhs.ts`, `analysis.ts`, `system.ts`
- API routes: Next.js App Router convention -- `src/app/api/jobs/route.ts`, `src/app/api/jobs/[id]/route.ts`
- Hooks: camelCase with `use-` prefix, hyphenated file name -- e.g. `use-job-stream.ts`
- Prompt templates: kebab-case in `src/prompts/` -- e.g. `agent-system.ts`

**Functions:**
- Exported helpers: camelCase -- `getDb()`, `createJob()`, `askClaude()`, `xhsSearch()`
- React hooks: camelCase with `use` prefix -- `useJobStream()`
- Private helpers within modules: camelCase -- `preFilterAccount()`, `calculateScore()`, `parseResult()`
- Tool handler function exports: camelCase + `Tool` suffix -- `xhsSearchTool`, `analyzeAccountTool`

**Variables:**
- Constants: UPPER_SNAKE_CASE for module-level constants -- `ACCOUNT_TTL`, `SEARCH_TTL`, `MAX_TOOL_ROUNDS`, `FAST_MODE_LIMITS`
- CSS class string variables: `Cls` suffix -- `inputCls`, `selectCls`, `labelCls`
- Generic locals: camelCase -- `jobId`, `storeProfile`, `runStatus`

**Types:**
- Interfaces: PascalCase -- `StoreProfile`, `ToolDefinition`, `ToolContext`, `BudgetLimits`
- Type aliases: PascalCase -- `JobRunStatus`, `JobMode`, `ArtifactType`, `TimelineEventType`
- Exported const objects used as enums: PascalCase -- `FAST_MODE_LIMITS`, `DEEP_MODE_LIMITS`

**Components:**
- Named exports only (no default exports for components, except `page.tsx` and `layout.tsx` per Next.js convention)
- Props interface defined inline or as `interface Props` directly above the component
- Sub-components co-located in the same file -- e.g. `TagInput` inside `StoreProfileForm.tsx`, `TimelineItem` inside `AgentTimeline.tsx`

## Code Style

**Formatting:**
- No Prettier config file present -- formatting relies on ESLint and editor defaults
- Indentation: 2 spaces
- Single quotes for strings in TypeScript/TSX
- Semicolons: present (not omitted)
- Trailing commas: used in multi-line constructs

**Linting:**
- ESLint 9 with flat config (`eslint.config.mjs`)
- Extends: `eslint-config-next/core-web-vitals` + `eslint-config-next/typescript`
- Global ignores: `.next/**`, `out/**`, `build/**`, `next-env.d.ts`
- TypeScript strict mode enabled (`tsconfig.json`: `"strict": true`)

**TypeScript Configuration:**
- Target: ES2017
- Module resolution: bundler
- JSX: react-jsx
- Path alias: `@/*` maps to `./src/*`
- `noEmit: true` (Next.js handles compilation)
- `isolatedModules: true`

## Import Organization

**Order (observed pattern):**
1. External packages / SDK imports -- `import OpenAI from 'openai'`, `import { Client } from '@modelcontextprotocol/sdk/client/index.js'`
2. Next.js / React imports -- `import { NextRequest, NextResponse } from 'next/server'`, `import { useState } from 'react'`
3. Internal library imports via `@/` alias -- `import * as db from '@/lib/db'`, `import { cn } from '@/lib/utils'`
4. Internal relative imports -- `import type { ToolDefinition, ToolContext } from '../types'`
5. Type-only imports: use `import type` syntax -- `import type { StoreProfile, JobMode } from '@/lib/types'`

**Path Aliases:**
- `@/*` -> `./src/*` (configured in `tsconfig.json`)
- Used consistently in API routes, pages, and components
- Library modules sometimes use relative paths within `src/lib/` subdirectories (e.g. `../db`, `../types`)

**Import Style:**
- Namespace imports for database: `import * as db from './db'` -- access via `db.createJob()`, `db.getJob()`
- Named imports for types: `import type { StoreProfile, BudgetLimits } from '../lib/types'`
- Named imports for utilities: `import { askClaudeJSON } from '../claude'`

## Error Handling

**Patterns:**
- API routes: validate input, return `NextResponse.json({ error: '...' }, { status: 400 })` for bad requests
- Tool handlers: try/catch around external calls, return `{ error: err.message }` on failure
- Agent runner: try/catch around the entire loop, log errors via `db.insertTimelineEvent()` with `job_error` event type
- Worker process: try/catch in poll loop, `console.error` for scheduler errors
- Client hooks: `.catch(() => { /* ignore parse errors */ })` for SSE parsing

**Error Propagation:**
- Database errors bubble up (better-sqlite3 throws on constraint violations)
- API routes do NOT use a centralized error handler -- each route handles errors individually
- The agent runner catches tool errors per-call and records them as `'error'` status in `tool_calls` table, then continues the loop

**Pattern for async errors in tools:**
```typescript
try {
  output = await executeTool(toolCall.function.name, input, context)
} catch (err: any) {
  status = 'error'
  errorMessage = err.message
  output = { error: err.message }
}
```

## Logging

**Framework:** `console.log` / `console.error` (no structured logging library)

**Patterns:**
- Worker process uses prefixed messages: `console.log('[scheduler] Starting Agent Scheduler...')`
- Timeline events stored in database serve as the primary execution log
- No log levels or log rotation configured

**When to log:**
- Worker lifecycle events (start, shutdown, job pickup)
- Error conditions in scheduler loop
- Agent execution events are recorded as `timeline_events` in the database, not console output

## Comments

**When to Comment:**
- Section separators with `// ---` dividers for logical groupings in long files (see `src/lib/db.ts`)
- Module-level doc comments: Chinese-language comment blocks at file tops (e.g. `src/lib/types.ts`: `// AI 对标账号分析与内容生成工具 v3.0 -- Agent 架构类型定义`)
- Inline comments for business rules and constants (in Chinese)

**JSDoc/TSDoc:**
- Not used -- no JSDoc or TSDoc annotations in the codebase
- Tool definitions use `description` fields in their `inputSchema` and `ToolDefinition.description` instead

## Function Design

**Size:** Functions vary widely. Database helper functions are small (5-10 lines). Tool handlers are medium (15-30 lines). Scoring functions like `calculateScore()` in `src/lib/tools/analysis.ts` are larger (~15 lines of dense computation).

**Parameters:**
- Object parameters for complex functions -- `options?: { maxTokens?: number; model?: string }`
- Destructured props in React components -- `({ jobId, onComplete, onError }: Props)`
- Generic typed update helpers -- `const update = <K extends keyof StoreProfile>(field: K, value: StoreProfile[K]) => ...`

**Return Values:**
- Database functions return `any | undefined` (no strict row typing)
- Tool handlers return plain objects (JSON-serializable)
- API routes return `NextResponse.json()` or `NextResponse` with SSE stream

## Module Design

**Exports:**
- Named exports only (no default exports except Next.js page/layout conventions)
- Single-responsibility: each tool file exports one or more `ToolDefinition` objects
- Barrel-style registry: `src/lib/tool-registry.ts` aggregates all tools and exports unified `getToolDefinitions()` / `executeTool()`

**Barrel Files:**
- `src/lib/tool-registry.ts` serves as the tool barrel -- imports from `./tools/xhs`, `./tools/analysis`, `./tools/system`
- No `index.ts` barrel files in `src/lib/` -- consumers import directly from modules

**Module Boundaries:**
- `src/lib/` -- shared business logic and database layer
- `src/lib/tools/` -- tool definitions (XHS data fetching, AI analysis, system tools)
- `src/prompts/` -- LLM prompt templates
- `src/components/` -- React UI components
- `src/app/api/` -- Next.js API routes (server-side)
- `src/worker.ts` -- standalone worker process (runs outside Next.js)

## React Conventions

**Client Components:**
- Marked with `'use client'` directive at file top
- All interactive components are client components: `StoreProfileForm`, `AgentTimeline`, `ResultPanel`, `page.tsx`

**Server Components:**
- `src/app/layout.tsx` is a server component (no `'use client'`)
- API route handlers are server-side by default

**State Management:**
- Local `useState` only -- no global state management library
- Custom hook `useJobStream` for SSE connection and event state
- Page-level state machine pattern: `type PageState = 'idle' | 'running' | 'completed' | 'error'`

**Styling:**
- Tailwind CSS v4 with CSS variables (oklch color space)
- Utility classes only -- no CSS modules, no styled-components
- Semantic color tokens defined in `globals.css`: `--color-primary`, `--color-secondary`, etc.
- Dark mode support via `.dark` variant
- shadcn/ui component library (base-nova style) for UI primitives
- `cn()` utility from `src/lib/utils.ts` for conditional class merging (clsx + tailwind-merge)

**Form Handling:**
- Uncontrolled-like pattern with `useState` for entire form object
- Generic `update` helper: `const update = <K extends keyof StoreProfile>(field: K, value: StoreProfile[K]) => ...`
- Custom `TagInput` component for array fields (specialties, advantages, etc.)

## API Route Conventions

**Pattern:**
```typescript
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const body = await req.json()
  // ... validation ...
  return NextResponse.json({ data }, { status: 201 })
}
```

**Dynamic route params:**
- Use `Promise<{ id: string }>` type for params (Next.js 15+ async params)
- Await params before use: `const { id } = await params`

**SSE pattern (see `src/app/api/jobs/[id]/stream/route.ts`):**
- `ReadableStream` with `TextEncoder` for SSE format
- `event: ${type}\ndata: ${JSON}\n\n` format
- Polling-based (1-second interval) with database reads
- Client-side `EventSource` consumption

## Database Conventions

**ORM:** None -- raw SQL via `better-sqlite3` prepared statements

**Patterns:**
- Singleton `getDb()` with lazy initialization
- WAL journal mode, foreign keys enabled
- Schema migration via `CREATE TABLE IF NOT EXISTS` in `migrate()` function
- JSON columns for complex data (`budget_json`, `data_json`, `input_json`)
- Manual JSON serialization/deserialization at call sites

**Example:**
```typescript
export function createJob(id: string, storeProfile: string, mode: string): void {
  getDb().prepare(
    'INSERT INTO jobs (id, store_profile, mode, run_status, budget_json) VALUES (?, ?, ?, ?, ?)'
  ).run(id, storeProfile, mode, 'queued', JSON.stringify({ ... }))
}
```

## LLM Integration Conventions

**Multi-LLM approach:**
- Zhipu GLM API (via OpenAI SDK) for the main agent loop -- configured in `src/lib/agent-runner.ts`
- Anthropic Claude SDK for analysis tools -- configured in `src/lib/claude.ts`
- Configuration via environment variables: `ZHIPU_API_KEY`, `ZHIPU_BASE_URL`, `LLM_MODEL`, `ANTHROPIC_API_KEY`
- Defaults centralized in `src/lib/llm-config.ts`

**Tool calling pattern:**
- OpenAI-compatible function calling format
- Tools defined as `ToolDefinition` objects with `name`, `description`, `inputSchema`, and `handler`
- Agent loop: call LLM -> check for `tool_calls` -> execute tools -> return results -> repeat

---

*Convention analysis: 2026-05-04*
