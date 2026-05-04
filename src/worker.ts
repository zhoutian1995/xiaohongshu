import { getNextQueuedProject } from './lib/db'
import { runPipeline } from './lib/job-runner'

const POLL_INTERVAL = 2000

async function main() {
  console.log('[worker] Starting job worker...')

  // Graceful shutdown
  let running = true
  process.on('SIGINT', () => {
    console.log('[worker] Received SIGINT, finishing current task...')
    running = false
  })
  process.on('SIGTERM', () => {
    console.log('[worker] Received SIGTERM, finishing current task...')
    running = false
  })

  while (running) {
    try {
      const project = getNextQueuedProject()
      if (project) {
        console.log(`[worker] Picking up project: ${project.id}`)
        await runPipeline(project.id)
        console.log(`[worker] Project ${project.id} completed`)
      }
    } catch (err: any) {
      console.error(`[worker] Error: ${err.message}`)
    }

    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL))
  }

  console.log('[worker] Shut down gracefully')
  process.exit(0)
}

main()
