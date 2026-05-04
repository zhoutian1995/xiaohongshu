import { xhsUserProfile, xhsGetNote } from '../xhs-client'
import { xhsLimiter, claudeLimiter } from '../rate-limiter'
import * as cache from '../cache'
import * as db from '../db'
import { calculateScore } from '../scorer'
import { askClaudeJSON } from '../claude'
import { BUILD_ANALYZE_PROMPT } from '../../prompts/analyze-account'

export async function analyze(projectId: string, context: any) {
  const { accounts, mode } = context

  // Step 1: Get detailed data for each account
  const enrichedAccounts = []
  for (const account of accounts) {
    await xhsLimiter.wait()
    const profile = await xhsUserProfile(account.userId)

    // Get recent notes
    await xhsLimiter.wait()
    const notesResult: any = await xhsUserProfile(account.userId) // TODO: use xhsUserNotes
    const notes = notesResult.notes ?? []

    // Calculate score
    const score = calculateScore(profile, notes, context.storeProfile, mode)

    // Save to DB
    const enriched = {
      ...account,
      followers: profile.followers,
      notesCount: profile.notesCount,
      notesLast30d: countRecentNotes(notes, 30),
      notesLast90d: countRecentNotes(notes, 90),
      avgLikes: avg(notes.map((n: any) => n.likes ?? 0)),
      avgComments: avg(notes.map((n: any) => n.comments ?? 0)),
      avgFavorites: avg(notes.map((n: any) => n.favorites ?? 0)),
      avgShares: avg(notes.map((n: any) => n.shareCount ?? 0)),
      collectToLikeRatio: avg(notes.map((n: any) => n.likes > 0 ? (n.favorites ?? 0) / Math.max(n.comments, 1) : 0)),
      consultCommentRate: 0, // proxy in fast mode
      score,
      notes,
    }

    db.upsertBenchmarkAccount(projectId, enriched)
    enrichedAccounts.push(enriched)
  }

  // Step 2: Sort by score and take top N
  const topN = mode === 'fast' ? 3 : 5
  enrichedAccounts.sort((a, b) => b.score.overallScore - a.score.overallScore)
  const topAccounts = enrichedAccounts.slice(0, topN)

  // Step 3: Deep analysis with Claude
  for (const account of topAccounts) {
    await claudeLimiter.wait()
    const prompt = BUILD_ANALYZE_PROMPT(account, context.storeProfile)
    const analysis = await askClaudeJSON<any>(prompt, '你是一位资深的小红书本地生活运营分析师。请用 JSON 格式输出分析结果。')

    account.analysis = analysis
    account.positioning = analysis.positioning ?? ''
    account.contentTypes = analysis.contentTypes ?? []

    db.upsertBenchmarkAccount(projectId, account)
  }

  return { ...context, accounts: topAccounts }
}

function countRecentNotes(notes: any[], days: number): number {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000
  return notes.filter((n: any) => (n.time ?? 0) * 1000 > cutoff).length
}

function avg(nums: number[]): number {
  return nums.length > 0 ? nums.reduce((a, b) => a + b, 0) / nums.length : 0
}
