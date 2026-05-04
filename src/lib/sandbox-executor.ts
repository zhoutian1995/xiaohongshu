import { spawn, ChildProcess } from 'child_process'
import path from 'path'
import fs from 'fs'

export interface SandboxResult {
  exitCode: number
  stdout: string
  stderr: string
  durationMs: number
}

export function spawnSandbox(
  jobId: string,
  mode: string,
  timeoutMs: number
): Promise<SandboxResult> {
  const workDir = `/tmp/xhs-agent/${jobId}`
  fs.mkdirSync(workDir, { recursive: true })

  const logFile = path.join(workDir, 'agent.log')
  const logStream = fs.createWriteStream(logFile)

  return new Promise((resolve) => {
    const startTime = Date.now()

    // Environment variable whitelist (no ...process.env spread)
    const SANDBOX_ENV_KEYS = [
      'PATH', 'HOME', 'NODE_ENV', 'DATABASE_PATH',
      'XHS_MCP_DATA_DIR', 'ZHIPU_API_KEY', 'ZHIPU_BASE_URL',
      'LLM_MODEL', 'JOB_ID', 'JOB_MODE',
    ] as const

    const env: Record<string, string | undefined> = {}
    for (const key of SANDBOX_ENV_KEYS) {
      const value = process.env[key]
      if (value !== undefined) {
        env[key] = value
      }
    }
    // Explicit overrides for this job
    env.JOB_ID = jobId
    env.JOB_MODE = mode
    env.DATABASE_PATH = process.env.DATABASE_PATH ?? './data/xhs.db'

    // Spawn agent CLI entry point
    const child: ChildProcess = spawn('npx', ['tsx', 'src/bin/agent.ts', '--job-id', jobId], {
      cwd: process.cwd(),
      env: env as any,
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''

    child.stdout?.on('data', (data: Buffer) => {
      const str = data.toString()
      stdout += str
      logStream.write(str)
    })

    child.stderr?.on('data', (data: Buffer) => {
      const str = data.toString()
      stderr += str
      logStream.write(str)
    })

    // Timeout handler
    const timer = setTimeout(() => {
      child.kill('SIGTERM')
      // Give it 5s to clean up, then force kill
      setTimeout(() => {
        if (!child.killed) child.kill('SIGKILL')
      }, 5000)
    }, timeoutMs)

    child.on('close', (code) => {
      clearTimeout(timer)
      logStream.close()
      resolve({
        exitCode: code ?? 1,
        stdout,
        stderr,
        durationMs: Date.now() - startTime,
      })
    })

    child.on('error', (err) => {
      clearTimeout(timer)
      logStream.close()
      resolve({
        exitCode: 1,
        stdout,
        stderr: stderr + '\n' + err.message,
        durationMs: Date.now() - startTime,
      })
    })
  })
}
