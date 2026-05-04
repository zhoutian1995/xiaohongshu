# Testing Patterns

**Analysis Date:** 2026-05-04

## Test Framework

**Runner:**
- Vitest 4.1.5
- Config: `vitest.config.ts` (minimal -- only `passWithNoTests: true`)

**Assertion Library:**
- Vitest built-in assertions (not yet used in project)

**Run Commands:**
```bash
npm test              # Run all tests (vitest)
npm run lint          # ESLint check
```

**Current test status:**
- **Zero test files exist in `src/`.** The only test files found are in `node_modules/`.
- `vitest.config.ts` is configured with `passWithNoTests: true`, confirming the project currently runs without any test suite.
- No `coverage` script in `package.json`.
- No `__tests__` directories or co-located test files.

## Test Configuration

**`vitest.config.ts`:**
```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    passWithNoTests: true,
  },
})
```

**Notable absences:**
- No `setupFiles` configured
- No `coverage` configuration
- No path aliases configured for test resolution (though `tsconfig.json` has `@/*` alias, it may need explicit Vitest config to work)
- No test environment specified (defaults to Node.js, not jsdom)

## Test File Organization

**Location:**
- No convention established yet -- there are no test files

**Recommended structure based on codebase layout:**
```
src/
├── lib/
│   ├── __tests__/
│   │   ├── db.test.ts           # Database CRUD operations
│   │   ├── cache.test.ts        # Cache TTL and key generation
│   │   ├── rate-limiter.test.ts # Rate limiting logic
│   │   ├── agent-runner.test.ts # Agent loop mocking
│   │   └── artifact-validator.test.ts  # Validation rules
│   ├── tools/
│   │   └── __tests__/
│   │       ├── xhs.test.ts      # XHS tool handlers
│   │       └── analysis.test.ts # Analysis tool handlers
│   └── ...
├── components/
│   └── __tests__/
│       ├── StoreProfileForm.test.tsx
│       ├── AgentTimeline.test.tsx
│       └── ResultPanel.test.tsx
└── app/
    └── api/
        └── __tests__/
            ├── jobs.test.ts
            └── jobs-[id]-stream.test.ts
```

## Test Structure

**Suite Organization (recommended pattern):**
```typescript
import { describe, it, expect, vi } from 'vitest'

describe('ModuleOrFunctionName', () => {
  it('should do X when Y', () => {
    // Arrange
    const input = ...
    // Act
    const result = ...
    // Assert
    expect(result).toBe(expected)
  })
})
```

**No existing test patterns to reference** -- the project would be starting from scratch.

## Mocking

**Framework:** Vitest built-in mocking (`vi.mock`, `vi.fn`, `vi.spyOn`)

**Recommended mock targets based on codebase:**

**External services that MUST be mocked:**
- `better-sqlite3` -- database operations should use in-memory database or mock
- `@anthropic-ai/sdk` -- Claude API calls in `src/lib/claude.ts`
- `openai` -- Zhipu GLM API calls in `src/lib/agent-runner.ts`
- `@modelcontextprotocol/sdk` -- XHS MCP client in `src/lib/xhs-client.ts`
- `child_process` -- sandbox spawning in `src/lib/sandbox-executor.ts`

**Database mock pattern:**
```typescript
import { vi } from 'vitest'

// Option A: In-memory SQLite for integration tests
import Database from 'better-sqlite3'
const testDb = new Database(':memory:')

// Option B: Mock the db module entirely
vi.mock('./db', () => ({
  getDb: vi.fn(),
  createJob: vi.fn(),
  getJob: vi.fn(),
  updateJobStatus: vi.fn(),
  // ... etc
}))
```

**LLM mock pattern:**
```typescript
vi.mock('./claude', () => ({
  askClaude: vi.fn().mockResolvedValue('mocked response'),
  askClaudeJSON: vi.fn().mockResolvedValue({ mocked: 'data' }),
}))
```

**XHS client mock pattern:**
```typescript
vi.mock('./xhs-client', () => ({
  xhsSearch: vi.fn().mockResolvedValue({ notes: [] }),
  xhsUserProfile: vi.fn().mockResolvedValue({ userId: 'test', followers: 100 }),
  xhsGetNote: vi.fn().mockResolvedValue({ noteId: 'test', title: 'Test Note' }),
}))
```

**What to Mock:**
- All external API calls (LLM APIs, XHS MCP service)
- Database layer for unit tests (use real in-memory DB for integration tests)
- `child_process.spawn` for sandbox executor tests
- File system operations

**What NOT to Mock:**
- Pure functions: `calculateScore()` in `src/lib/tools/analysis.ts`, `preFilterAccount()`
- Validation logic: `validateJobArtifacts()` in `src/lib/artifact-validator.ts`
- Cache key generation: `accountKey()`, `searchKey()` in `src/lib/cache.ts`
- Rate limiter timing logic (test with very small intervals)

## Fixtures and Factories

**Test Data:**
No fixtures or factories exist yet.

**Recommended fixture pattern based on existing types:**
```typescript
// src/lib/__tests__/fixtures.ts
import type { StoreProfile, Job, Budget } from '../types'

export const mockStoreProfile: StoreProfile = {
  industry: '美容美发',
  city: '杭州',
  district: '西湖区',
  storeName: '测试门店',
  priceRange: '中客单(100-500)',
  targetAudience: '25-35岁都市女性',
  businessArea: '皮肤管理、美容护理',
  specialties: ['日式皮肤管理'],
  realAdvantages: ['5年经验'],
  filmableAssets: ['门店环境'],
  onCamera: true,
  onCameraInfo: '店主本人',
  postFrequency: '每周2-3次',
  conversionMethod: '私信咨询',
}

export const mockBudget: Budget = {
  searchesUsed: 0,
  profilesUsed: 0,
  notesUsed: 0,
  claudeTokensUsed: 0,
  toolCallsTotal: 0,
  elapsedMs: 0,
}
```

**Recommended location:**
- `src/lib/__tests__/fixtures.ts` for shared test data
- Inline fixtures for component-specific tests

## Coverage

**Requirements:** None enforced

**Coverage tool:** Not configured

**To enable coverage:**
1. Add `@vitest/coverage-v8` to devDependencies
2. Add coverage config to `vitest.config.ts`:
```typescript
export default defineConfig({
  test: {
    passWithNoTests: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: ['src/app/**', 'node_modules/**'],
    },
  },
})
```
3. Add script to `package.json`: `"test:coverage": "vitest --coverage"`

## Test Types

**Unit Tests (not yet present):**
- Recommended for: pure functions in `src/lib/tools/analysis.ts` (`preFilterAccount`, `calculateScore`), `src/lib/artifact-validator.ts`, `src/lib/cache.ts`, `src/lib/rate-limiter.ts`

**Integration Tests (not yet present):**
- Recommended for: database CRUD in `src/lib/db.ts` (use in-memory SQLite), tool handler chains, API routes with mocked database

**E2E Tests:**
- Not used
- Would require a running Next.js server and the XHS MCP service
- Consider Playwright for future E2E testing of the form -> timeline -> results flow

## Testing Challenges Specific to This Codebase

**1. Database Singleton:**
`src/lib/db.ts` uses a module-level singleton (`let db: Database.Database | null = null`). Tests need either:
- A `resetDb()` export for test isolation, or
- Mock the entire `db` module, or
- Use `vi.resetModules()` between tests

**2. Long-running Agent Loop:**
`src/lib/agent-runner.ts` has a loop up to 50 rounds. Testing requires mocking the OpenAI client to control when the loop terminates (return empty `tool_calls` to stop).

**3. SSE Streams:**
`src/app/api/jobs/[id]/stream/route.ts` uses `ReadableStream` with polling. Testing requires either:
- Mock `db.getTimelineEvents()` to control event flow
- Use `supertest` or Next.js test utilities to consume the stream

**4. External MCP Service:**
The XHS MCP client (`src/lib/xhs-client.ts`) spawns an `npx` child process. All tests must mock this module to avoid spawning real processes.

**5. Environment Variables:**
Multiple modules read `process.env` at module load time (e.g., `src/lib/agent-runner.ts` reads `ZHIPU_API_KEY`). Tests need `vi.stubEnv()` before importing these modules, or mock them entirely.

## Common Test Patterns (Recommended)

**Async Testing:**
```typescript
import { describe, it, expect, vi } from 'vitest'

it('should handle async tool execution', async () => {
  vi.mock('./xhs-client', () => ({
    xhsSearch: vi.fn().mockResolvedValue({ notes: [{ noteId: '1', title: 'Test' }] }),
  }))

  const result = await xhsSearchTool.handler({ keyword: '美容', limit: 10 }, mockContext)
  expect(result).toHaveProperty('notes')
})
```

**Error Testing:**
```typescript
it('should handle tool execution errors gracefully', async () => {
  vi.mock('./claude', () => ({
    askClaudeJSON: vi.fn().mockRejectedValue(new Error('API limit exceeded')),
  }))

  await expect(
    analyzeAccountTool.handler({ profile: mockProfile, notes: [] }, mockContext)
  ).rejects.toThrow('API limit exceeded')
})
```

**Database Integration Testing:**
```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'

describe('db operations', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    // Run migration SQL against in-memory DB
    db.exec(migrationSQL)
  })

  it('should create and retrieve a job', () => {
    createJob('test-id', '{"storeName":"Test"}', 'fast')
    const job = getJob('test-id')
    expect(job).toBeDefined()
    expect(job.mode).toBe('fast')
  })
})
```

---

*Testing analysis: 2026-05-04*
