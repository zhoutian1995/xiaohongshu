import Anthropic from '@anthropic-ai/sdk'
import { randomUUID } from 'crypto'
import * as db from './db'
import { getToolDefinitions, executeTool } from './tool-registry'
import { BUILD_AGENT_SYSTEM_PROMPT } from '../prompts/agent-system'
import type { Budget, BudgetLimits, StoreProfile, JobMode, ToolContext } from './types'
import { FAST_MODE_LIMITS, DEEP_MODE_LIMITS } from './types'

const MAX_TOOL_ROUNDS = 50

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

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

  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: `请开始分析。门店信息已包含在 system prompt 中。` }
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

      if (budget.elapsedMs >= limits.maxElapsedMs) {
        db.insertTimelineEvent(jobId, 'job_error', `已达到耗时上限 (${limits.maxElapsedMs / 1000}s)`)
        break
      }

      // Call Claude
      const response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: systemPrompt,
        tools,
        messages,
      })

      // Track token usage
      if (response.usage) {
        budget.claudeTokensUsed += (response.usage.input_tokens + response.usage.output_tokens)
      }

      // Add assistant response to messages
      messages.push({ role: 'assistant', content: response.content })

      // Process response blocks
      const toolUseBlocks = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')

      if (toolUseBlocks.length === 0) {
        // No tool calls - agent is done talking
        break
      }

      // Execute tool calls
      const toolResults: Anthropic.ToolResultBlockParam[] = []
      for (const toolUse of toolUseBlocks) {
        const startTime = Date.now()
        const input = toolUse.input as Record<string, unknown>

        db.insertTimelineEvent(jobId, 'tool_called', `调用 ${toolUse.name}`, input)

        let output: any
        let status: 'success' | 'error' | 'budget_exceeded' = 'success'
        let errorMessage: string | undefined

        try {
          output = await executeTool(toolUse.name, input, context)
          budget.toolCallsTotal++

          // Track specific tool budgets
          if (toolUse.name === 'xhs_search') budget.searchesUsed++
          if (toolUse.name === 'xhs_user_profile') budget.profilesUsed++
          if (toolUse.name === 'xhs_get_note') budget.notesUsed++

        } catch (err: any) {
          status = 'error'
          errorMessage = err.message
          output = { error: err.message }
        }

        const durationMs = Date.now() - startTime

        db.insertToolCall({
          id: toolUse.id,
          jobId,
          toolName: toolUse.name,
          input: JSON.stringify(input),
          output: JSON.stringify(output),
          status,
          errorMessage,
          durationMs,
          budgetAfter: { ...budget },
        })

        db.insertTimelineEvent(jobId, 'tool_completed', `${toolUse.name} 完成 (${durationMs}ms)`, { status })

        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: JSON.stringify(output),
        })

        // Update budget in DB
        db.updateJobStatus(jobId, 'running', { budget })

        // Check if agent reported completion
        if (toolUse.name === 'report_progress' && input.phase === 'validating') {
          // Agent thinks it's done, let it finish
        }
      }

      messages.push({ role: 'user', content: toolResults })
    }
  } catch (err: any) {
    db.insertTimelineEvent(jobId, 'job_error', `Agent error: ${err.message}`)
  }
}
