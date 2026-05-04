import { describe, it, expect, beforeEach } from 'vitest'

// Use in-memory database for test isolation
beforeEach(() => {
  vi.resetModules()
  process.env.DATABASE_PATH = ':memory:'
})

async function getDbModule() {
  return import('../lib/db')
}

import { vi } from 'vitest'

describe('Core Job Lifecycle Integration', () => {
  it('creates job and claims it atomically', async () => {
    const db = await getDbModule()
    const jobId = 'test-job-1'
    db.createJob(jobId, JSON.stringify({ industry: '美容美发', city: '北京', storeName: '测试店' }), 'fast')

    // Verify created as queued
    const created = db.getJob(jobId)
    expect(created).toBeDefined()
    expect(created.run_status).toBe('queued')
    expect(created.store_profile.industry).toBe('美容美发')

    // Claim it
    const claimed = db.claimNextJob()
    expect(claimed).toBeDefined()
    expect(claimed.run_status).toBe('spawning')
    expect(claimed.id).toBe(jobId)

    // Second claim returns undefined
    const claimed2 = db.claimNextJob()
    expect(claimed2).toBeUndefined()
  })

  it('runs full lifecycle: queued → spawning → running → validating → completed', async () => {
    const db = await getDbModule()
    const jobId = 'test-job-2'

    // Create
    db.createJob(jobId, JSON.stringify({ industry: '美容美发', city: '北京', storeName: '测试店' }), 'fast')

    // Claim
    db.claimNextJob()

    // Start running
    db.updateJobStatus(jobId, 'running', { started_at: new Date().toISOString() })
    db.insertTimelineEvent(jobId, 'job_started', 'Agent 开始执行')
    db.insertTimelineEvent(jobId, 'tool_called', '调用 xhs_search', { keyword: '美容' })

    // Save valid artifacts
    db.saveArtifact('art-1', jobId, 'benchmark_accounts', JSON.stringify({
      accounts: Array.from({ length: 4 }, (_, i) => ({
        userId: `m-${i}`, classification: { type: 'merchant' }, notes: [{ noteId: `n-${i}` }]
      }))
    }))
    db.saveArtifact('art-2', jobId, 'account_analysis', JSON.stringify({
      accounts: [{ userId: 'm-0', analysis: { evidenceList: [{ evidence: 'test evidence' }] } }]
    }))
    db.saveArtifact('art-3', jobId, 'content_strategy', JSON.stringify({
      scripts: [
        { title: '脚本1', shootingChecklist: ['镜头1'], referenceNotes: [{ noteId: 'n-0' }] },
        { title: '脚本2', shootingChecklist: ['镜头1'], referenceNotes: [{ noteId: 'n-1' }] },
      ]
    }))

    // Validate
    const { validateJobArtifacts } = await import('../lib/artifact-validator')
    const validation = validateJobArtifacts(jobId)
    expect(validation.passed).toBe(true)

    // Complete
    db.updateJobStatus(jobId, 'completed', { completed_at: new Date().toISOString() })
    db.insertTimelineEvent(jobId, 'job_completed', '任务完成')

    // Verify final state
    const job = db.getJob(jobId)
    expect(job.run_status).toBe('completed')

    const events = db.getTimelineEvents(jobId)
    expect(events.length).toBeGreaterThanOrEqual(3)

    const artifacts = db.getArtifacts(jobId)
    expect(artifacts.length).toBe(3)
  })

  it('handles error path correctly', async () => {
    const db = await getDbModule()
    const jobId = 'test-job-3'
    db.createJob(jobId, JSON.stringify({ industry: '美容美发', city: '北京', storeName: '测试店' }), 'fast')
    db.claimNextJob()

    db.updateJobStatus(jobId, 'error', {
      error_message: 'Agent 执行超时',
      completed_at: new Date().toISOString(),
    })
    db.insertTimelineEvent(jobId, 'job_error', 'Agent 执行超时')

    const job = db.getJob(jobId)
    expect(job.run_status).toBe('error')
    expect(job.error_message).toBe('Agent 执行超时')
  })

  it('tracks timeline events with afterId filtering', async () => {
    const db = await getDbModule()
    const jobId = 'test-job-4'
    db.createJob(jobId, JSON.stringify({ industry: '美容美发', city: '北京', storeName: '测试店' }), 'fast')

    const id1 = db.insertTimelineEvent(jobId, 'job_started', 'started')
    const id2 = db.insertTimelineEvent(jobId, 'tool_called', 'search', { keyword: '美容' })
    const id3 = db.insertTimelineEvent(jobId, 'job_completed', 'done')

    const all = db.getTimelineEvents(jobId)
    expect(all.length).toBe(3)

    // Filter after first event
    const afterFirst = db.getTimelineEvents(jobId, id1)
    expect(afterFirst.length).toBe(2)
    expect(afterFirst[0].event_type).toBe('tool_called')
  })
})
