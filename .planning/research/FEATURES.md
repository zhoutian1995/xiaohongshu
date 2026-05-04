# Feature Landscape

**Domain:** AI-powered competitive analysis tool for Xiaohongshu (Little Red Book) local business merchants
**Researched:** 2026-05-04
**Confidence:** MEDIUM -- based on competitive analysis of existing platforms (QianGua, XinHong, Sprout Social), community discussions (Zhihu, Woshipm), and the current codebase state.

---

## Table Stakes

Features users expect. Missing these means the product feels incomplete or untrustworthy.

| Feature | Why Expected | Complexity | Current Status | Notes |
|---------|--------------|------------|----------------|-------|
| **Store profile input form** | Entry point. Users need to tell the system who they are. | Low | DONE | StoreProfileForm exists with industry, city, store name, specialties, etc. |
| **Competitor account discovery** | Core value. Users come to find who to learn from. | Medium | PARTIAL | xhs_search tool exists but xhs-mcp integration not connected. Agent cannot actually search yet. |
| **Account scoring & ranking** | Users need to know which accounts are worth studying. | Medium | PARTIAL | Scoring algorithm exists (localRelevance, industryRelevance, activityScore, etc.) but untested end-to-end. |
| **Real-time progress display** | Agent takes 8-15 min. Users need feedback or they leave. | Low | DONE | AgentTimeline + SSE streaming implemented. Basic but functional. |
| **Structured analysis results** | Users expect organized output, not raw text dumps. | Medium | PARTIAL | ResultPanel with tabs (accounts/analysis/scripts) exists. Needs design overhaul per reference mockup. |
| **Script/copy generation** | The whole point. Users want content they can use. | High | PARTIAL | generate_content tool + breakdown_scripts tool exist. Prompts built. Untested E2E. |
| **Evidence-backed conclusions** | Trust. If AI says "this account is good," user needs to see why. | Medium | PARTIAL | Evidence tags in UI, evidence arrays in prompts. But note-level linking is weak (noteId shown as truncated hash). |
| **Job history & re-access** | Users need to revisit past analyses. | Low | DONE | Jobs stored in SQLite, accessible by UUID. No listing page though. |
| **Error handling & retry** | Agent may fail. User needs clear feedback, not a blank screen. | Low | PARTIAL | Error states in UI exist. No retry mechanism. |

## Differentiators

Features that set this product apart from existing platforms (QianGua, XinHong, Sprout Social). These are NOT expected by users but create significant competitive moat when present.

| Feature | Value Proposition | Complexity | Current Status | Notes |
|---------|-------------------|------------|----------------|-------|
| **Fully autonomous Agent pipeline** | No manual steps. User fills form, gets strategy. Zero operational knowledge required. This is THE differentiator vs QianGua (manual data lookup) and generic AI tools (manual prompting). | High | PARTIAL | Architecture exists (Worker -> Sandbox -> Agent loop). Not running E2E. |
| **Merchant-specific scoring (not influencer)** | Most tools optimize for finding KOLs/influencers. This tool scores accounts on learnability for merchants -- small follower accounts that get local engagement are scored HIGHER than mega-accounts. | Low | DONE | `learnability` score inverts: lower followers = higher learnability. Unique in market. |
| **Script breakdown with shooting checklist** | Not just "write copy." Decomposes WHY a note works (title formula, cover style, hook technique, CTA), then generates executable scripts with camera shots. | Medium | PARTIAL | breakdown_scripts tool exists with hit vs average comparison. Shooting checklist in generate prompt. |
| **7-day launch plan generation** | Takes the analysis and turns it into a day-by-day action plan with specific tasks. Bridges the gap between "insight" and "action." | Medium | PARTIAL | weekPlan in generate prompt. Not surfaced well in current UI. |
| **Store context-aware generation** | Uses actual store profile (specialties, filmable assets, on-camera willingness) to tailor content. Generic AI tools ignore this. | Low | DONE | StoreProfile is threaded through all prompts. |
| **Dual mode (fast/deep)** | Caters to different user needs: quick scan vs comprehensive analysis. Most tools offer one depth level. | Low | DONE | FAST_MODE_LIMITS and DEEP_MODE_LIMITS with different budgets. |
| **Artifact validation & auto-repair** | Agent output is validated for completeness. If insufficient, auto-repair kicks in. Ensures output quality without human review. | Medium | PARTIAL | artifact-validator.ts + repair cycle in worker.ts. Needs real-world testing. |
| **Topic pool with source attribution** | Generates a pool of topic ideas, each traced back to which competitor inspired it. Transparent, not black-box. | Low | PARTIAL | topicPool in generate prompt with sourceAccount field. Not visible in current UI. |
| **Tag library generation** | Auto-generates categorized hashtags based on competitor analysis. Saves users 30 min of manual tag research. | Low | PARTIAL | tagLibrary in generate prompt. Not surfaced in UI. |

## Anti-Features

Features to explicitly NOT build. These are traps that would dilute the product or create unsustainable complexity.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Multi-platform support (Douyin, Bilibili, etc.)** | Dilutes focus. Each platform has unique content mechanics, data sources, and API constraints. XHS alone has enough depth. Douyin would require an entirely different agent pipeline. | Stay XHS-only until the core loop is proven and has users. Re-evaluate after PMF. |
| **User authentication / multi-tenant** | Auth adds complexity (session management, password reset, email verification, RBAC) with zero value for MVP. Job-by-UUID access is sufficient. | Keep UUID-based anonymous access. Add auth only when commercializing. |
| **Real-time competitor monitoring / alerting** | Requires persistent data pipelines, cron jobs, notification infrastructure, and ongoing API costs. This is what QianGua charges $200+/month for. Not viable for a lightweight tool on a 2GB server. | One-shot analysis per job. Users re-run when they want fresh data. |
| **Automated publishing to XHS** | Platform ToS risk. XHS actively detects and bans automated posting. Also requires managing image generation, which is a separate hard problem. | Generate content for user to manually post. Provide copy-paste ready output. |
| **Image/cover generation** | Requires dedicated image generation models (DALL-E/Midjourney-style), which adds API costs, latency, and quality uncertainty. Cover design is highly taste-driven. | Provide detailed cover descriptions ("warm-toned photo of salon interior, natural light, before/after split") that user can photograph or create in Canva. |
| **Live streaming analytics** | XHS live streaming is a different product category with different data, metrics, and user needs. Would double the scope. | Focus purely on note-based content strategy. |
| **Brand/corporate dashboards** | Enterprise features (team management, API access, white-label) require auth, billing, and support infrastructure. | Single-user tool. One job at a time. Simple. |
| **Comment/review sentiment analysis at scale** | Requires collecting thousands of comments, running NLP models, and maintaining sentiment accuracy. QianGua does this with a full engineering team. | If needed later, limit to top-10 comments per analyzed note. Not a core feature. |
| **Content calendar / scheduling** | Scheduling requires persistent state, timezone handling, cron infrastructure, and platform API integration for publishing. | Generate a 7-day plan in the strategy output. User executes manually. |
| **Mobile-responsive design** | The tool is desktop-first by design (merchant sitting at their computer doing competitive analysis). Mobile adds significant frontend complexity for marginal gain. | Desktop-only layout. Optimize for 1024px+ viewport. |

## Feature Dependencies

```
Store Profile Input (DONE)
  |
  v
XHS Data Collection (BLOCKED -- xhs-mcp not integrated)
  |
  +---> Account Discovery (xhs_search)
  |       |
  |       v
  |     Account Scoring (calculateScore)
  |       |
  |       v
  |     Deep Account Analysis (analyze_account -- requires Claude API)
  |       |
  |       v
  |     Script Breakdown (breakdown_scripts -- hit vs average comparison)
  |
  +---> Note Detail Collection (xhs_get_note -- for evidence)
          |
          v
        Content Strategy Generation (generate_content)
          |
          v
        Artifact Validation (artifact-validator)
          |
          v
        Result Display (ResultPanel -- needs design overhaul)
```

**Critical path:** XHS Data Collection is the blocking dependency for everything downstream. Without real XHS data, the entire Agent pipeline is a skeleton.

**Parallel opportunities:**
- UI redesign can happen independently of Agent pipeline work
- Artifact validation testing can use mock data
- Result display can be built with sample artifacts

## MVP Recommendation

**Prioritize (must ship):**
1. **XHS data collection via xhs-mcp** -- without this, nothing works. This is the #1 blocker.
2. **End-to-end Agent execution** -- Agent Runner CLI entry point + actual tool calls flowing through. Even if output is rough.
3. **Result display redesign** -- per reference mockup. Current tabs are too minimal for the rich output the Agent produces.

**Defer (post-MVP):**
- **Topic pool UI**: Keep in JSON output for now, surface later.
- **Tag library UI**: Same -- data exists, UI can wait.
- **Job history listing page**: UUID access is fine for MVP.
- **Export/report generation**: Users can screenshot for now.

**Never build (anti-features):**
- Multi-platform, auto-publishing, real-time monitoring, image generation.

## Competitive Positioning

### How this tool differs from existing platforms

| Dimension | QianGua / XinHong (Data Platforms) | Generic AI (ChatGPT, GLM) | This Tool |
|-----------|--------------------------------------|---------------------------|-----------|
| **Input** | Manual search, filtering, browsing | Free-form text prompt | Structured store questionnaire |
| **Process** | User manually finds competitors, reads data, draws conclusions | User must know what to ask, iterate prompts | Autonomous agent discovers, analyzes, generates |
| **Output** | Raw data + charts | Unstructured text | Structured strategy with evidence, scripts, 7-day plan |
| **Learning curve** | High (need to understand data metrics) | Medium (need prompt engineering) | Low (fill form, get result) |
| **Cost** | $200-800/month | $20/month + effort | TBD (LLM API costs only) |
| **Target user** | Professional marketing teams | Tech-savvy individuals | Local business owners with zero marketing experience |

### Unique niche this tool occupies

This is the only tool that takes a local business owner from "I don't know what to post on XHS" to "here are 2-3 ready-to-shoot scripts with a 7-day plan" in 8-15 minutes with zero marketing knowledge required. No data platform does this. No generic AI chatbot does this with structured evidence-backed analysis.

## Sources

- [QianGua Data Platform](https://www.qian-gua.com) -- Leading XHS analytics platform,功能包括达人搜索、爆文分析、竞品监控、营销结案
- [XinHong (XinBang)](https://xh.newrank.cn/intro) -- 新榜旗下XHS数据分析，独有爆文流量分析与删文检测
- [Sprout Social Competitive Analysis](https://sproutsocial.com/competitive-analysis/) -- International benchmark for social media competitive analysis features
- [影刀RPA XHS采集](https://zhuanlan.zhihu.com/p/1977467662100623924) -- RPA-based batch data collection for XHS competitor accounts
- [小红书数据分析工具测评 (FanRuan)](https://www.fanruan.com/blog/article/1797870/) -- Comparative review of XHS analytics tools
- [小红书运营工具痛点分析 (人人都是产品经理)](https://www.woshipm.com/ai/6231023.html) -- AI+RPA automation for XHS content creation
- [AI Content Strategy for Social Media (SocialInsider)](https://www.socialinsider.io/blog/ai-content-strategy/) -- Best practices for AI-driven content strategy
- [15 Competitor Analysis Tools (Sprout Social)](https://sproutsocial.com/insights/competitor-analysis-tools/) -- Feature breakdown of leading competitive analysis tools
- Codebase analysis: `src/lib/tools/`, `src/lib/types.ts`, `src/components/` -- all reviewed for current feature implementation status

---

*Feature landscape research: 2026-05-04*
