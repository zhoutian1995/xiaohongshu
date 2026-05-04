import { claudeLimiter } from '../rate-limiter'
import { askClaudeJSON } from '../claude'
import { BUILD_GENERATE_PROMPT } from '../../prompts/generate-script'

export async function generate(projectId: string, context: any) {
  const { storeProfile, accounts, breakdownResult, mode } = context

  await claudeLimiter.wait()
  const scriptCount = mode === 'fast' ? 2 : 3
  const prompt = BUILD_GENERATE_PROMPT(storeProfile, accounts, breakdownResult, scriptCount)
  const strategy = await askClaudeJSON(prompt, '你是一位资深的小红书本地生活内容策划师。请用 JSON 格式输出完整的内容策略。')

  return { ...context, strategy }
}
