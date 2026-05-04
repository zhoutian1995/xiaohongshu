# Technology Stack

**Analysis Date:** 2026-05-04

## Languages

**Primary:**
- TypeScript 5.x - All application code (`src/`), API routes, agent logic, tools, worker, and React components

**Secondary:**
- CSS (via Tailwind) - Styling in `src/app/globals.css`
- YAML - CI/CD pipeline in `.github/workflows/deploy.yml`
- JSON - Configuration files (`package.json`, `tsconfig.json`, `components.json`)

## Runtime

**Environment:**
- Node.js 20.x - Production runtime (pinned in CI via `actions/setup-node@v4` with `node-version: '20'`)
- Local dev uses Node.js 25.x (not pinned, but compatible)

**Package Manager:**
- npm - Default package manager
- Lockfile: `package-lock.json` present

## Frameworks

**Core:**
- Next.js 16.2.4 - Full-stack React framework (App Router)
  - Uses `--webpack` flag for both dev (`next dev --webpack`) and build (`next build --webpack`)
  - RSC (React Server Components) enabled (`"rsc": true` in `components.json`)
  - Web API routes for backend: `src/app/api/`
  - Static pages for frontend: `src/app/page.tsx`

**UI:**
- React 19.2.4 - UI library
- React DOM 19.2.4 - DOM renderer
- shadcn/ui 4.6.0 - Component library (base-nova style, using `@/components/ui` alias)
  - Config: `components.json` at project root
- Tailwind CSS 4.x - Utility-first CSS via `@tailwindcss/postcss`
  - PostCSS config: `postcss.config.mjs`
- `@base-ui/react` 1.4.1 - Unstyled UI primitives
- `class-variance-authority` 0.7.1 - Component variant management
- `clsx` 2.1.1 + `tailwind-merge` 3.5.0 - Conditional class merging (`cn()` utility in `src/lib/utils.ts`)
- `lucide-react` 1.14.0 - Icon library
- `tw-animate-css` 1.4.0 - Tailwind animation utilities

**Testing:**
- Vitest 4.1.5 - Test runner
  - Config: `vitest.config.ts` (minimal, `passWithNoTests: true`)
  - No test files exist in `src/` yet

**Build/Dev:**
- tsx 4.21.0 - TypeScript execution for worker process (`src/worker.ts`)
- ESLint 9.x + `eslint-config-next` 16.2.4 - Linting
  - Config: `eslint.config.mjs` (flat config format)
- TypeScript 5.x - Type checking
  - Config: `tsconfig.json` (strict mode, bundler module resolution, `@/*` path alias)

## Key Dependencies

**Critical:**
- `openai` 6.35.0 - OpenAI SDK used as HTTP client for Zhipu GLM API (OpenAI-compatible interface)
  - Configured in `src/lib/agent-runner.ts` and `src/lib/llm-config.ts`
  - Default model: `glm-5-turbo`
  - Base URL: `https://open.bigmodel.cn/api/coding/paas/v4`
- `@anthropic-ai/sdk` 0.92.0 - Anthropic SDK for Claude analysis calls
  - Configured in `src/lib/claude.ts`
  - Used by `analyze_account`, `breakdown_scripts`, and `generate_content` tools
  - Default model: `claude-sonnet-4-20250514`
- `@modelcontextprotocol/sdk` 1.29.0 - MCP SDK for XHS data collection
  - Client in `src/lib/xhs-client.ts`
  - Connects to `@sillyl12324/xhs-mcp` via stdio transport
- `better-sqlite3` 12.9.0 - Synchronous SQLite database driver
  - All database access in `src/lib/db.ts`
  - WAL mode enabled for concurrent read/write
- `zod` 4.4.3 - Schema validation (declared, usage TBD)

**Infrastructure:**
- `next` 16.2.4 - Application framework and HTTP server
- PM2 - Process manager in production (manages `xiaohongshu-web` on port 3002 and `xiaohongshu-worker`)

## Configuration

**Environment:**
- No `.env` files present in repo (expected to be created as `.env.local` or provided by server environment)
- Environment variables consumed (from `process.env` grep):
  - `ZHIPU_API_KEY` - Zhipu GLM API authentication (required)
  - `ZHIPU_BASE_URL` - Zhipu API base URL (defaults to `https://open.bigmodel.cn/api/coding/paas/v4`)
  - `LLM_MODEL` - LLM model name (defaults to `glm-5-turbo`)
  - `ANTHROPIC_API_KEY` - Anthropic/Claude API authentication (required)
  - `DATABASE_PATH` - SQLite database file path (defaults to `./data/xhs.db`)
  - `XHS_MCP_DATA_DIR` - XHS MCP browser data directory (defaults to `~/.xhs-mcp`)

**Build:**
- `next.config.ts` - Minimal, no custom options
- `tsconfig.json` - Strict TypeScript, ES2017 target, bundler resolution, `@/*` path alias to `./src/*`
- `postcss.config.mjs` - Tailwind CSS 4 PostCSS plugin
- `eslint.config.mjs` - Flat ESLint config with Next.js core-web-vitals and TypeScript presets

**Scripts:**
- `npm run dev` - Start dev server with webpack (`next dev --webpack`)
- `npm run build` - Production build (`next build`)
- `npm run start` - Start production server (`next start`)
- `npm run worker` - Start background worker (`tsx src/worker.ts`)
- `npm run test` - Run tests (`vitest`)
- `npm run lint` - Run linter (`eslint`)

## Platform Requirements

**Development:**
- Node.js 20+ (CI pins to 20)
- npm for package management
- SQLite (bundled via better-sqlite3, no separate installation)
- Chrome/Chromium (used by xhs-mcp for browser automation, headless mode)

**Production:**
- Linux server (deployed via rsync to `/home/admin/project/xiaohongshu/`)
- PM2 process manager (runs web server on port 3002 + background worker)
- SQLite database at `./data/xhs.db` (persistent, excluded from deployment rsync)
- GitHub Actions CI/CD pipeline on push to `main`

---

*Stack analysis: 2026-05-04*
