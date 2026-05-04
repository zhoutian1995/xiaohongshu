# Testing

## Framework

- **Vitest** v4.1.5 (via `npm test`)
- Config: `vitest.config.ts` with `passWithNoTests: true`

## Current Status

**No test files exist.** Zero coverage. The project has no `.test.ts` or `.spec.ts` files anywhere.

The `passWithNoTests: true` flag was added specifically to prevent CI failure when no tests are found.

## Test Commands

```bash
npm test          # runs vitest
npx vitest run    # single run (CI mode)
npx vitest        # watch mode
```

## CI Integration

GitHub Actions (`.github/workflows/deploy.yml`) runs `npm test` before deploy.

## Gaps & Priorities

| Priority | Area | Notes |
|----------|------|-------|
| Critical | `agent-runner.ts` | Core agent loop, tool dispatch, budget tracking |
| High | `tool-registry.ts` | Tool definitions, schema validation, execution routing |
| High | `db.ts` | SQLite operations, CRUD, data integrity |
| High | `sandbox-executor.ts` | Child process lifecycle, timeout, cleanup |
| Medium | API routes | Request validation, SSE streaming, error responses |
| Medium | `report-generator.ts` | Output formatting, template rendering |
| Low | Frontend components | React components, SSE hook, state management |

## Recommended Setup

1. Create `src/lib/__tests__/` for unit tests
2. Start with agent-runner and tool-registry (highest risk)
3. Use `better-sqlite3` in-memory mode for DB tests
4. Mock OpenAI SDK calls for agent-runner tests
5. Integration test for full agent loop with recorded tool calls
