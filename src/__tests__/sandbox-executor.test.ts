import { EventEmitter } from 'events'
import { PassThrough } from 'stream'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const child = new EventEmitter() as EventEmitter & {
  stdout: PassThrough
  stderr: PassThrough
  kill: ReturnType<typeof vi.fn>
}

vi.mock('child_process', () => ({
  spawn: vi.fn(() => child),
}))

import { spawn } from 'child_process'
import { spawnSandbox } from '../lib/sandbox-executor'

describe('spawnSandbox', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    child.stdout = new PassThrough()
    child.stderr = new PassThrough()
    child.kill = vi.fn()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns exitCode 2 when the sandbox times out', async () => {
    const resultPromise = spawnSandbox('timeout-job', 'fast', 1000)

    await vi.advanceTimersByTimeAsync(1000)
    expect(child.kill).toHaveBeenCalledWith('SIGTERM')

    child.emit('close', null)
    const result = await resultPromise

    expect(spawn).toHaveBeenCalledWith(
      'npx',
      ['tsx', 'src/bin/agent.ts', '--job-id', 'timeout-job'],
      expect.objectContaining({ cwd: process.cwd() })
    )
    expect(result.exitCode).toBe(2)
  })

  it('force kills when a timed-out child does not close', async () => {
    const resultPromise = spawnSandbox('stuck-job', 'fast', 1000)

    await vi.advanceTimersByTimeAsync(6000)
    expect(child.kill).toHaveBeenCalledWith('SIGTERM')
    expect(child.kill).toHaveBeenCalledWith('SIGKILL')

    child.emit('close', null)
    await expect(resultPromise).resolves.toMatchObject({ exitCode: 2 })
  })
})
