import { runAgent } from '../lib/agent-runner'

// Parse --job-id from command line args (D-02: CLI arg > env var)
function getJobId(): string | undefined {
  const args = process.argv.slice(2)
  const jobIdIndex = args.indexOf('--job-id')
  if (jobIdIndex !== -1 && args[jobIdIndex + 1]) {
    return args[jobIdIndex + 1]
  }
  return process.env.JOB_ID
}

const jobId = getJobId()

if (!jobId) {
  process.stderr.write('Error: jobId is required. Use --job-id <id> or set JOB_ID env var.\n')
  process.exit(1)
}

runAgent(jobId)
  .then(() => {
    process.exit(0)
  })
  .catch((err) => {
    process.stderr.write(`Agent error: ${err.message}\n`)
    process.exit(1)
  })
