import * as db from './lib/db'
const { getNextQueuedJob, updateJobStatus, insertTimelineEvent, getJob, getArtifacts } = db
import { spawnSandbox } from './lib/sandbox-executor'
import { validateJobArtifacts } from './lib/artifact-validator'
import { FAST_MODE_LIMITS, DEEP_MODE_LIMITS } from './lib/types'

const POLL_INTERVAL = 2000
const MAX_REPAIR_ATTEMPTS = 1

async function main() {
  console.log('[scheduler] Starting Agent Scheduler...')

  let running = true
  process.on('SIGINT', () => {
    console.log('[scheduler] Shutting down...')
    running = false
  })
  process.on('SIGTERM', () => {
    console.log('[scheduler] Shutting down...')
    running = false
  })

  while (running) {
    try {
      const job = getNextQueuedJob()
      if (job) {
        console.log(`[scheduler] Picking up job: ${job.id}`)
        await processJob(job.id)
      }
    } catch (err: any) {
      console.error(`[scheduler] Error: ${err.message}`)
    }

    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL))
  }

  console.log('[scheduler] Stopped')
  process.exit(0)
}

async function processJob(jobId: string) {
  const job = getJob(jobId)
  if (!job) return

  const limits = job.mode === 'fast' ? FAST_MODE_LIMITS : DEEP_MODE_LIMITS

  // Phase 1: Run Agent in sandbox
  updateJobStatus(jobId, 'spawning')
  insertTimelineEvent(jobId, 'job_started', '启动沙盒环境')

  const result = await spawnSandbox(jobId, job.mode, limits.maxElapsedMs)

  if (result.exitCode !== 0) {
    const errorMsg = result.exitCode === 2 ? 'Agent 执行超时' :
                     result.exitCode === 3 ? '预算超限' :
                     `Agent 异常退出 (code=${result.exitCode})`
    updateJobStatus(jobId, 'error', { error_message: errorMsg, completed_at: new Date().toISOString() })
    insertTimelineEvent(jobId, 'job_error', errorMsg)
    return
  }

  // Phase 2: Validate artifacts
  updateJobStatus(jobId, 'validating')
  insertTimelineEvent(jobId, 'validation_passed', '开始校验产物')

  let validation = validateJobArtifacts(jobId)

  // Phase 3: Repair if needed (max 1 attempt)
  if (!validation.passed) {
    insertTimelineEvent(jobId, 'validation_failed', `校验失败: ${validation.errors.join('; ')}`)

    // Save validation errors as repair context artifact (PIPE-04)
    const repairContext = {
      type: 'repair_context',
      validationErrors: validation.errors,
      existingArtifacts: db.getArtifacts(jobId).map((a: any) => ({
        type: a.type,
        summary: `exists (${JSON.parse(a.data_json) ? 'has data' : 'empty'})`,
      })),
    }
    db.insertToolCall({
      id: `repair-${jobId}`,
      jobId,
      toolName: 'repair_context',
      input: JSON.stringify({ validationErrors: validation.errors }),
      output: JSON.stringify(repairContext),
      status: 'success',
      errorMessage: undefined,
      durationMs: 0,
      budgetAfter: { ...getJob(jobId)?.budget_json },
    })

    // Repair: send errors back to agent (PIPE-04: error context flows into repair)
    updateJobStatus(jobId, 'repairing')
    insertTimelineEvent(jobId, 'repair_started', '启动修复（含错误上下文）')

    const repairResult = await spawnSandbox(jobId, job.mode, Math.min(limits.maxElapsedMs, 3 * 60 * 1000))

    if (repairResult.exitCode === 0) {
      validation = validateJobArtifacts(jobId)
    }
  }

  // Final status
  if (validation.passed) {
    updateJobStatus(jobId, 'completed', { completed_at: new Date().toISOString() })
    insertTimelineEvent(jobId, 'validation_passed', '产物校验通过')
    insertTimelineEvent(jobId, 'job_completed', '任务完成')
  } else {
    updateJobStatus(jobId, 'error', {
      error_message: `校验失败（修复后）: ${validation.errors.join('; ')}`,
      completed_at: new Date().toISOString(),
    })
    insertTimelineEvent(jobId, 'job_error', `校验失败: ${validation.errors.join('; ')}`)
  }
}

main()
