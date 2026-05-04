import type { ToolDefinition, ToolContext } from '../types'
import { claudeLimiter } from '../rate-limiter'
import { askClaudeJSON } from '../claude'

export const analyzeAccountTool: ToolDefinition = {
  name: 'analyze_account',
  description: 'AI 深度分析对标账号。包括账号分类（商家/达人/品牌）、多维评分（同城相关性、行业相关性、活跃度等）、证据型分析（定位、内容类型、爆款共性）。每个结论都附带证据引用。',
  inputSchema: {
    type: 'object',
    properties: {
      profile: { type: 'object', description: '用户资料（xhs_user_profile 的返回值）' },
      notes: { type: 'array', description: '该账号的笔记列表', items: { type: 'object' } },
      storeProfile: { type: 'object', description: '门店问卷信息（可选，默认使用任务上下文）' },
    },
    required: ['profile', 'notes'],
  },
  handler: async (input, ctx) => {
    const sp = input.storeProfile ?? ctx.storeProfile
    const profile = input.profile
    const notes = input.notes ?? []

    // Step 1: Rule-based pre-classification
    const classification = preFilterAccount(profile.bio ?? '', profile.nickname ?? '', notes)

    // Step 2: Calculate score
    const score = calculateScore(profile, notes, sp, ctx.mode)

    // Step 3: AI deep analysis (only for merchant accounts)
    let analysis = null
    if (classification.type === 'merchant' || classification.type === 'uncertain') {
      await claudeLimiter.wait()
      const prompt = buildAnalysisPrompt(profile, notes, sp, score)
      analysis = await askClaudeJSON<any>(prompt, '你是一位资深的小红书本地生活运营分析师。请用 JSON 格式输出分析结果。每个结论必须带证据引用。')
    }

    return {
      userId: profile.userId,
      nickname: profile.nickname,
      classification,
      score,
      analysis,
    }
  },
}

export const breakdownScriptsTool: ToolDefinition = {
  name: 'breakdown_scripts',
  description: 'AI 拆解脚本框架。对比分析爆款笔记和普通笔记的差异（标题公式、封面风格、钩子技巧、CTA话术），归纳可复用脚本模板。',
  inputSchema: {
    type: 'object',
    properties: {
      accountName: { type: 'string', description: '账号昵称' },
      hitNotes: { type: 'array', description: '爆款笔记组（互动最高）', items: { type: 'object' } },
      averageNotes: { type: 'array', description: '普通笔记组（互动最低）', items: { type: 'object' } },
    },
    required: ['accountName', 'hitNotes', 'averageNotes'],
  },
  handler: async (input, ctx) => {
    await claudeLimiter.wait()
    const prompt = buildBreakdownPrompt(input.accountName, input.hitNotes, input.averageNotes)
    return await askClaudeJSON<any>(prompt, '你是一位资深的小红书内容策略分析师。请用 JSON 格式输出拆解结果。')
  },
}

export const generateContentTool: ToolDefinition = {
  name: 'generate_content',
  description: 'AI 生成内容策略和脚本。基于门店信息和对标分析结果，生成账号定位、7天启动计划、选题池、可拍脚本。学习结构，不复用表达。',
  inputSchema: {
    type: 'object',
    properties: {
      accounts: { type: 'array', description: '对标账号分析结果', items: { type: 'object' } },
      breakdowns: { type: 'array', description: '脚本拆解结果', items: { type: 'object' } },
      scriptCount: { type: 'number', description: '生成脚本数量，默认2', default: 2 },
    },
    required: ['accounts', 'breakdowns'],
  },
  handler: async (input, ctx) => {
    await claudeLimiter.wait()
    const prompt = buildGeneratePrompt(ctx.storeProfile, input.accounts, input.breakdowns, input.scriptCount ?? 2)
    return await askClaudeJSON<any>(prompt, '你是一位资深的小红书本地生活内容策划师。请用 JSON 格式输出完整内容策略。')
  },
}

// --- Helper functions ---

function preFilterAccount(bio: string, nickname: string, notes: any[]): { type: string; reason: string } {
  bio = bio.toLowerCase()
  if (bio.includes('预约') || bio.includes('地址') || bio.includes('营业') || bio.includes('到店'))
    return { type: 'merchant', reason: '简介包含预约/地址/营业/到店关键词' }
  if (bio.includes('探店') || bio.includes('合作私信') || bio.includes('达人'))
    return { type: 'influencer', reason: '简介包含探店/合作/达人关键词' }
  if (/官方|旗舰店|连锁|总部|集团/.test(nickname))
    return { type: 'brand', reason: '昵称疑似机构名/品牌名' }
  if (notes.length > 0) {
    const dealRatio = notes.filter((n: any) => (n.title ?? '').includes('团购') || (n.title ?? '').includes('秒杀')).length / notes.length
    if (dealRatio > 0.7) return { type: 'deal', reason: '超过70%笔记为团购/秒杀内容' }
  }
  return { type: 'uncertain', reason: '规则无法判定' }
}

function calculateScore(profile: any, notes: any[], sp: any, mode: string): any {
  const weights = mode === 'fast'
    ? { localRelevance: 0.25, industryRelevance: 0.20, consultCommentRate: 0.10, activityScore: 0.25, recentHitRate: 0.10, learnability: 0.10 }
    : { localRelevance: 0.25, industryRelevance: 0.20, consultCommentRate: 0.20, activityScore: 0.15, recentHitRate: 0.10, learnability: 0.10 }

  const localRelevance = Math.min(10, (bio => bio.includes(sp.city) ? 5 : 0)(profile.bio ?? '') + Math.min(5, notes.filter(n => `${n.title ?? ''} ${n.content ?? ''}`.includes(sp.city)).length / Math.max(notes.length, 1) * 10))
  const industryRelevance = Math.min(10, notes.filter(n => `${n.title ?? ''} ${n.content ?? ''}`.includes(sp.industry)).length / Math.max(notes.length, 1) * 10)
  const activityScore = Math.min(10, notes.length >= 4 ? 10 : notes.length >= 2 ? 7 : notes.length >= 1 ? 4 : 0)
  const recentHitRate = notes.length < 3 ? 5 : Math.min(10, notes.filter(n => (n.likes ?? 0) > avg(notes.map((x: any) => x.likes ?? 0)) * 1.5).length / notes.length * 20)
  const learnability = profile.followers > 100000 ? 3 : profile.followers > 50000 ? 5 : profile.followers > 10000 ? 7 : 9
  const consultCommentRate = mode === 'fast' ? Math.min(10, avg(notes.map((n: any) => (n.favorites ?? 0) / Math.max(n.comments ?? 0, 1))) / 5 * 10) : 5

  const overallScore = Math.min(100, Math.round((localRelevance * weights.localRelevance + industryRelevance * weights.industryRelevance + consultCommentRate * weights.consultCommentRate + activityScore * weights.activityScore + recentHitRate * weights.recentHitRate + learnability * weights.learnability) * 10))

  return { localRelevance, industryRelevance, consultCommentRate, activityScore, recentHitRate, learnability, overallScore }
}

function avg(nums: number[]): number { return nums.length > 0 ? nums.reduce((a, b) => a + b, 0) / nums.length : 0 }

function buildAnalysisPrompt(profile: any, notes: any[], sp: any, score: any): string {
  return `深度分析以下小红书对标账号。

目标：${sp.industry}，${sp.city}，${sp.storeName}
账号：${profile.nickname}（粉丝${profile.followers}，笔记${profile.notesCount}）
评分：${score.overallScore}/100
近期笔记：${notes.slice(0, 10).map((n: any, i: number) => `${i+1}. [${n.likes??0}赞] ${n.title??'无标题'}`).join('\n')}

每个结论必须附带 evidence 数组（noteId+title+relevantData）。
返回 JSON：{ positioning, targetAudience, differentiation, contentTypes:[{type,percentage,avgEngagement,evidence}], postingFrequency, hitPatterns, evidenceList:[{conclusion,evidence,metric}] }`
}

function buildBreakdownPrompt(name: string, hits: any[], avgs: any[]): string {
  return `对比分析两组笔记差异。

爆款组：${hits.map((n: any) => `[${n.likes??0}赞] ${n.title??''}`).join(' | ')}
普通组：${avgs.map((n: any) => `[${n.likes??0}赞] ${n.title??''}`).join(' | ')}

返回 JSON：{ hitPatterns:[{titleFormula,coverStyle,hookTechnique,ctaTechnique,evidence}], averagePatterns:[...], differenceFactors:[{dimension,hitBehavior,averageBehavior,impact}], reusableTemplates:[{name,structure,applicableScenarios,referenceNotes}] }`
}

function buildGeneratePrompt(sp: any, accounts: any[], breakdowns: any[], count: number): string {
  return `为门店生成小红书内容策略。

门店：${sp.storeName}，${sp.industry}，${sp.city}
客单价：${sp.priceRange}，客群：${sp.targetAudience}
擅长：${sp.specialties.join('、')}
出镜：${sp.onCamera ? '是' : '否'}

对标：${accounts.map((a: any) => `${a.nickname}(${a.analysis?.positioning??''})`).join('、')}

生成${count}条脚本。学习结构，不复用表达。每条脚本带 shootingChecklist 和 referenceNotes。
返回 JSON：{ positioning, positioningEvidence, weekPlan:[{day,task,shootingNotes,onCamera}], topicPool:[{title,sourceAccount,engagement}], scripts:[{title,coverDescription,copy,shootingChecklist,tags,referenceNotes}], tagLibrary:[{category,tags}] }`
}
