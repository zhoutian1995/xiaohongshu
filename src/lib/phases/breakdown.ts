import { claudeLimiter } from '../rate-limiter'
import { askClaudeJSON } from '../claude'
import { BUILD_BREAKDOWN_PROMPT } from '../../prompts/breakdown-script'

export async function breakdown(projectId: string, context: any) {
  const { accounts } = context
  const allBreakdowns = []

  for (const account of accounts) {
    const notes = account.notes ?? []
    if (notes.length < 6) {
      console.log(`[breakdown] Skipping ${account.nickname}: only ${notes.length} notes (< 6)`)
      continue
    }

    // Split into hit and average groups
    const sorted = [...notes].sort((a: any, b: any) => (b.likes ?? 0) - (a.likes ?? 0))
    let hitGroup: any[], avgGroup: any[]

    if (sorted.length >= 10) {
      hitGroup = sorted.slice(0, 5)
      avgGroup = sorted.slice(-5)
    } else {
      const topN = Math.ceil(sorted.length * 0.4)
      hitGroup = sorted.slice(0, topN)
      avgGroup = sorted.slice(-topN)
    }

    await claudeLimiter.wait()
    const prompt = BUILD_BREAKDOWN_PROMPT(account, hitGroup, avgGroup)
    const result = await askClaudeJSON(prompt, '你是一位资深的小红书内容策略分析师。请用 JSON 格式输出拆解结果。')

    allBreakdowns.push({ account, breakdown: result })
  }

  return { ...context, breakdownResult: allBreakdowns }
}
