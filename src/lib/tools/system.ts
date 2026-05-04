import { randomUUID } from 'crypto'
import type { ToolDefinition, ToolContext } from '../types'
import * as db from '../db'

export const saveArtifactTool: ToolDefinition = {
  name: 'save_artifact',
  description: '保存结构化产物到数据库。每次分析完成后调用，保存对标账号、分析结果、脚本拆解或内容策略。',
  inputSchema: {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        enum: ['benchmark_accounts', 'account_analysis', 'script_breakdown', 'content_strategy'],
        description: '产物类型',
      },
      data: { type: 'object', description: '产物数据（JSON 对象）' },
    },
    required: ['type', 'data'],
  },
  handler: async (input, ctx) => {
    const id = randomUUID()
    db.saveArtifact(id, ctx.jobId, input.type, JSON.stringify(input.data))
    db.insertTimelineEvent(ctx.jobId, 'artifact_saved', `保存产物: ${input.type}`, { artifactId: id })
    return { artifactId: id, type: input.type }
  },
}

export const reportProgressTool: ToolDefinition = {
  name: 'report_progress',
  description: '向前端报告当前进度。Agent 在关键节点调用此工具，前端通过 SSE 实时展示。',
  inputSchema: {
    type: 'object',
    properties: {
      phase: {
        type: 'string',
        enum: ['searching', 'analyzing', 'generating', 'validating'],
        description: '当前阶段',
      },
      message: { type: 'string', description: '进度描述，如"正在分析第3个账号"' },
    },
    required: ['phase', 'message'],
  },
  handler: async (input, ctx) => {
    db.insertTimelineEvent(ctx.jobId, 'tool_completed', `[${input.phase}] ${input.message}`)
    return { ok: true }
  },
}
