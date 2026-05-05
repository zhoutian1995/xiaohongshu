import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  disconnectXhs: vi.fn(),
  insertTimelineEvent: vi.fn(),
}))

vi.mock('openai', () => ({
  default: vi.fn(function OpenAIMock() {
    return {
      chat: {
        completions: {
          create: mocks.create,
        },
      },
    }
  }),
}))

vi.mock('../lib/db', () => ({
  getJob: vi.fn(() => ({
    id: 'job-1',
    mode: 'fast',
    store_profile: {
      industry: '皮肤管理',
      city: '杭州',
      storeName: '测试门店',
      priceRange: '300-800',
      targetAudience: '25-40 岁女性',
      businessArea: '城西',
      specialties: ['清洁护理'],
      realAdvantages: ['服务稳定'],
      filmableAssets: ['护理过程'],
      onCamera: false,
      postFrequency: '每周 3 条',
      conversionMethod: '私信预约',
    },
    budget_json: {
      toolCallsTotal: 0,
      searchesUsed: 0,
      profilesUsed: 0,
      notesUsed: 0,
      claudeTokensUsed: 0,
    },
  })),
  updateJobStatus: vi.fn(),
  insertTimelineEvent: mocks.insertTimelineEvent,
  insertToolCall: vi.fn(),
}))

vi.mock('../lib/tool-registry', () => ({
  getToolDefinitions: vi.fn(() => []),
  executeTool: vi.fn(),
}))

vi.mock('../lib/xhs-client', () => ({
  disconnectXhs: mocks.disconnectXhs,
}))

import { runAgent } from '../lib/agent-runner'

describe('runAgent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('disconnects xhs resources after a successful run', async () => {
    mocks.create.mockResolvedValueOnce({
      choices: [{ message: { role: 'assistant', content: 'done' } }],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    })

    await runAgent('job-1')

    expect(mocks.disconnectXhs).toHaveBeenCalledTimes(1)
  })

  it('disconnects xhs resources after an agent error', async () => {
    mocks.create.mockRejectedValue(new Error('llm unavailable'))

    await runAgent('job-1')

    expect(mocks.insertTimelineEvent).toHaveBeenCalledWith(
      'job-1',
      'job_error',
      expect.stringContaining('Agent error: llm unavailable')
    )
    expect(mocks.disconnectXhs).toHaveBeenCalledTimes(1)
  })
})
