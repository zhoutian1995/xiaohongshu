import { describe, it, expect } from 'vitest'
import { getToolDefinitions, executeTool } from '../lib/tool-registry'

describe('getToolDefinitions', () => {
  it('returns 9 tool definitions', () => {
    const defs = getToolDefinitions()
    expect(defs).toHaveLength(9)
  })

  it('each definition has correct structure', () => {
    const defs = getToolDefinitions()
    for (const def of defs) {
      expect(def.type).toBe('function')
      expect(def.function).toBeDefined()
      expect(def.function.name).toBeTruthy()
      expect(def.function.description).toBeTruthy()
      expect(def.function.parameters).toBeDefined()
    }
  })

  it('includes all expected tool names', () => {
    const defs = getToolDefinitions()
    const names = defs.map(d => d.function.name)
    const expected = [
      'xhs_search', 'xhs_user_profile', 'xhs_get_note', 'xhs_login_check',
      'analyze_account', 'breakdown_scripts', 'generate_content',
      'save_artifact', 'report_progress',
    ]
    for (const name of expected) {
      expect(names).toContain(name)
    }
  })
})

describe('executeTool', () => {
  it('throws for unknown tool name', async () => {
    await expect(executeTool('unknown_tool', {}, {} as any)).rejects.toThrow('Unknown tool')
  })
})
