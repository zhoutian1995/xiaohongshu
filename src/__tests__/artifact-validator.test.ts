import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lib/db', () => ({
  getArtifacts: vi.fn(),
}))

import { getArtifacts } from '../lib/db'
import { validateJobArtifacts } from '../lib/artifact-validator'

const mockGetArtifacts = vi.mocked(getArtifacts)

const validBenchmarks = [{
  type: 'benchmark_accounts',
  data_json: JSON.stringify({
    accounts: Array.from({ length: 4 }, (_, i) => ({
      userId: `merchant-${i}`,
      classification: { type: 'merchant' },
      notes: [{ noteId: `note-${i}` }]
    }))
  })
}]

const validAnalysis = [{
  type: 'account_analysis',
  data_json: JSON.stringify({
    accounts: [{
      userId: 'merchant-0',
      analysis: {
        evidenceList: [{ evidence: '该账号在视频中使用...', conclusion: '内容定位' }]
      }
    }]
  })
}]

const validStrategy = [{
  type: 'content_strategy',
  data_json: JSON.stringify({
    scripts: [
      { title: '脚本1', shootingChecklist: ['镜头1'], referenceNotes: [{ noteId: 'note-0' }] },
      { title: '脚本2', shootingChecklist: ['镜头1'], referenceNotes: [{ noteId: 'note-1' }] },
    ]
  })
}]

beforeEach(() => {
  vi.clearAllMocks()
})

describe('validateJobArtifacts', () => {
  it('passes with all valid artifacts', () => {
    mockGetArtifacts.mockReturnValue([...validBenchmarks, ...validAnalysis, ...validStrategy] as any)
    const result = validateJobArtifacts('job-1')
    expect(result.passed).toBe(true)
    expect(result.errors).toEqual([])
  })

  it('fails when benchmark_accounts is missing', () => {
    mockGetArtifacts.mockReturnValue([...validAnalysis, ...validStrategy] as any)
    const result = validateJobArtifacts('job-2')
    expect(result.passed).toBe(false)
    expect(result.errors.some(e => e.includes('benchmark_accounts'))).toBe(true)
  })

  it('fails when fewer than 3 merchant accounts', () => {
    const fewMerchants = [{
      type: 'benchmark_accounts',
      data_json: JSON.stringify({
        accounts: [{ userId: 'm-0', classification: { type: 'merchant' }, notes: [{ noteId: 'n-0' }] }]
      })
    }]
    mockGetArtifacts.mockReturnValue([...fewMerchants, ...validAnalysis, ...validStrategy] as any)
    const result = validateJobArtifacts('job-3')
    expect(result.passed).toBe(false)
    expect(result.errors.some(e => e.includes('不足3个'))).toBe(true)
  })

  it('fails when account_analysis is missing', () => {
    mockGetArtifacts.mockReturnValue([...validBenchmarks, ...validStrategy] as any)
    const result = validateJobArtifacts('job-4')
    expect(result.passed).toBe(false)
    expect(result.errors.some(e => e.includes('account_analysis'))).toBe(true)
  })

  it('fails when analysis has empty evidence', () => {
    const noEvidence = [{
      type: 'account_analysis',
      data_json: JSON.stringify({
        accounts: [{ userId: 'm-0', analysis: { evidenceList: [{ evidence: '', conclusion: 'test' }] } }]
      })
    }]
    mockGetArtifacts.mockReturnValue([...validBenchmarks, ...noEvidence, ...validStrategy] as any)
    const result = validateJobArtifacts('job-5')
    expect(result.passed).toBe(false)
    expect(result.errors.some(e => e.includes('缺少证据引用'))).toBe(true)
  })

  it('fails when content_strategy is missing', () => {
    mockGetArtifacts.mockReturnValue([...validBenchmarks, ...validAnalysis] as any)
    const result = validateJobArtifacts('job-6')
    expect(result.passed).toBe(false)
    expect(result.errors.some(e => e.includes('content_strategy'))).toBe(true)
  })

  it('fails when scripts fewer than 2', () => {
    const oneScript = [{
      type: 'content_strategy',
      data_json: JSON.stringify({
        scripts: [{ title: '脚本1', shootingChecklist: ['镜头1'], referenceNotes: [{ noteId: 'note-0' }] }]
      })
    }]
    mockGetArtifacts.mockReturnValue([...validBenchmarks, ...validAnalysis, ...oneScript] as any)
    const result = validateJobArtifacts('job-7')
    expect(result.passed).toBe(false)
    expect(result.errors.some(e => e.includes('不足2条'))).toBe(true)
  })

  it('fails when script missing shootingChecklist', () => {
    const noChecklist = [{
      type: 'content_strategy',
      data_json: JSON.stringify({
        scripts: [
          { title: '脚本1', shootingChecklist: [], referenceNotes: [{ noteId: 'note-0' }] },
          { title: '脚本2', shootingChecklist: ['镜头1'], referenceNotes: [{ noteId: 'note-1' }] },
        ]
      })
    }]
    mockGetArtifacts.mockReturnValue([...validBenchmarks, ...validAnalysis, ...noChecklist] as any)
    const result = validateJobArtifacts('job-8')
    expect(result.passed).toBe(false)
    expect(result.errors.some(e => e.includes('shootingChecklist'))).toBe(true)
  })
})
