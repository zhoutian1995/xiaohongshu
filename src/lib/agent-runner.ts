import OpenAI from 'openai'
import { randomUUID } from 'crypto'
import * as db from './db'
import { getToolDefinitions, executeTool } from './tool-registry'
import { BUILD_AGENT_SYSTEM_PROMPT } from '../prompts/agent-system'
import type { Budget, BudgetLimits, StoreProfile, JobMode, ToolContext } from './types'
import { FAST_MODE_LIMITS, DEEP_MODE_LIMITS } from './types'

const MAX_TOOL_ROUNDS = 50

const client = new OpenAI({
  apiKey: process.env.ZHIPU_API_KEY,
  baseURL: process.env.ZHIPU_BASE_URL ?? 'https://open.bigmodel.cn/api/coding/paas/v4',
})

const LLM_MODEL = process.env.LLM_MODEL ?? 'glm-5-turbo'

export async function runAgent(jobId: string): Promise<void> {
  const job = db.getJob(jobId)
  if (!job) throw new Error(`Job ${jobId} not found`)

  const storeProfile: StoreProfile = job.store_profile
  const mode: JobMode = job.mode
  const limits: BudgetLimits = mode === 'fast' ? FAST_MODE_LIMITS : DEEP_MODE_LIMITS
  let budget: Budget = job.budget_json

  const tools = getToolDefinitions()
  const systemPrompt = BUILD_AGENT_SYSTEM_PROMPT(storeProfile, mode, limits)

  const context: ToolContext = { jobId, mode, storeProfile, budget, budgetLimits: limits }

  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: '请开始分析。门店信息已包含在 system prompt 中。' },
  ]

  db.updateJobStatus(jobId, 'running', { started_at: new Date().toISOString() })
  db.insertTimelineEvent(jobId, 'job_started', 'Agent 开始执行')

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      // Check budget
      if (budget.toolCallsTotal >= limits.maxToolCalls) {
        db.insertTimelineEvent(jobId, 'job_error', `已达到工具调用上限 (${limits.maxToolCalls})`)
        break
      }

      // Call LLM with retry (PIPE-03: exponential backoff, max 3 retries)
      let response: OpenAI.ChatCompletion
      let retries = 0
      const maxRetries = 3
      while (true) {
        try {
          response = await client.chat.completions.create({
            model: LLM_MODEL,
            messages,
            tools,
            max_tokens: 4096,
          })
          break
        } catch (llmErr: any) {
          retries++
          if (retries >= maxRetries) throw llmErr
          const delayMs = Math.min(1000 * Math.pow(2, retries - 1), 10000)
          db.insertTimelineEvent(jobId, 'job_error', `LLM 调用失败 (重试 ${retries}/${maxRetries}): ${llmErr.message}`)
          await new Promise(resolve => setTimeout(resolve, delayMs))
        }
      }

      const choice = response.choices[0]
      const msg = choice.message

      // Track token usage
      if (response.usage) {
        budget.claudeTokensUsed += (response.usage.prompt_tokens + response.usage.completion_tokens)
      }

      // Add assistant message to conversation
      messages.push(msg as any)

      // No tool calls — agent is done
      if (!msg.tool_calls || msg.tool_calls.length === 0) {
        break
      }

      // Execute each tool call
      for (const tc of msg.tool_calls) {
        // Cast to function tool call (we only use function tools)
        const toolCall = tc as OpenAI.Chat.Completions.ChatCompletionMessageFunctionToolCall
        const startTime = Date.now()
        let input: any
        try {
          input = JSON.parse(toolCall.function.arguments)
        } catch (parseErr: any) {
          const errorMsg = `JSON parse error for tool ${toolCall.function.name}: ${parseErr.message}`
          db.insertTimelineEvent(jobId, 'job_error', errorMsg)
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify({ error: errorMsg, raw: toolCall.function.arguments }),
          })
          continue
        }

        db.insertTimelineEvent(jobId, 'tool_called', `调用 ${toolCall.function.name}`, input)

        // Per-resource budget check (PIPE-01)
        if (toolCall.function.name === 'xhs_search' && budget.searchesUsed >= limits.maxSearches) {
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify({ error: `搜索次数已达上限 (${limits.maxSearches})` }),
          })
          continue
        }
        if (toolCall.function.name === 'xhs_user_profile' && budget.profilesUsed >= limits.maxProfiles) {
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify({ error: `用户资料查询已达上限 (${limits.maxProfiles})` }),
          })
          continue
        }
        if (toolCall.function.name === 'xhs_get_note' && budget.notesUsed >= limits.maxNotes) {
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify({ error: `笔记详情查询已达上限 (${limits.maxNotes})` }),
          })
          continue
        }

        let output: any
        let status: 'success' | 'error' | 'budget_exceeded' = 'success'
        let errorMessage: string | undefined

        try {
          output = await executeTool(toolCall.function.name, input, context)
          budget.toolCallsTotal++

          if (toolCall.function.name === 'xhs_search') budget.searchesUsed++
          if (toolCall.function.name === 'xhs_user_profile') budget.profilesUsed++
          if (toolCall.function.name === 'xhs_get_note') budget.notesUsed++

        } catch (err: any) {
          status = 'error'
          errorMessage = err.message
          output = { error: err.message }
        }

        const durationMs = Date.now() - startTime

        db.insertToolCall({
          id: toolCall.id,
          jobId,
          toolName: toolCall.function.name,
          input: JSON.stringify(input),
          output: JSON.stringify(output),
          status,
          errorMessage,
          durationMs,
          budgetAfter: { ...budget },
        })

        db.insertTimelineEvent(jobId, 'tool_completed', `${toolCall.function.name} 完成 (${durationMs}ms)`, { status })

        // Add tool result to conversation
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(output),
        })

        db.updateJobStatus(jobId, 'running', { budget })
      }
    }
  } catch (err: any) {
    db.insertTimelineEvent(jobId, 'job_error', `Agent error: ${err.message}`)
  }
}
