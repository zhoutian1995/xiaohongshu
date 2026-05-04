import type { ToolDefinition, ToolContext } from './types'
import { FAST_MODE_LIMITS, DEEP_MODE_LIMITS } from './types'

// ---- Tool implementations ----
import { xhsSearchTool, xhsUserProfileTool, xhsGetNoteTool } from './tools/xhs'
import { analyzeAccountTool, breakdownScriptsTool, generateContentTool } from './tools/analysis'
import { saveArtifactTool, reportProgressTool } from './tools/system'

const ALL_TOOLS: ToolDefinition[] = [
  xhsSearchTool,
  xhsUserProfileTool,
  xhsGetNoteTool,
  analyzeAccountTool,
  breakdownScriptsTool,
  generateContentTool,
  saveArtifactTool,
  reportProgressTool,
]

const toolMap = new Map(ALL_TOOLS.map(t => [t.name, t]))

/** OpenAI/Zhipu-compatible function calling format */
export function getToolDefinitions(): any[] {
  return ALL_TOOLS.map(t => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.inputSchema,
    },
  }))
}

export async function executeTool(name: string, input: any, context: ToolContext): Promise<any> {
  const tool = toolMap.get(name)
  if (!tool) throw new Error(`Unknown tool: ${name}`)
  return tool.handler(input, context)
}
