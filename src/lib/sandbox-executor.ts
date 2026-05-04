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

    // Spawn agent-runner as child process
    const child: ChildProcess = spawn('npx', ['tsx', 'src/lib/agent-runner.ts'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        JOB_ID: jobId,
        JOB_MODE: mode,
        DATABASE_PATH: process.env.DATABASE_PATH ?? './data/xhs.db',
        XHS_MCP_DATA_DIR: process.env.XHS_MCP_DATA_DIR,
        ZHIPU_API_KEY: process.env.ZHIPU_API_KEY,
        ZHIPU_BASE_URL: process.env.ZHIPU_BASE_URL,
        LLM_MODEL: process.env.LLM_MODEL,
      },
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
