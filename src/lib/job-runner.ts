import * as db from './db'
import { discover } from './phases/discover'
import { analyze } from './phases/analyze'
import { breakdown } from './phases/breakdown'
import { generate } from './phases/generate'
import { insertJobEvent, updateProjectStatus } from './db'
import { disconnectXhs } from './xhs-client'

const PHASES = [
  { name: '对标发现+分类', fn: discover },
  { name: '评分+深度分析', fn: analyze },
  { name: '脚本框架拆解', fn: breakdown },
  { name: '首周脚本生成', fn: generate },
]

export async function runPipeline(projectId: string): Promise<void> {
  const project = db.getProject(projectId)
  if (!project) throw new Error(`Project ${projectId} not found`)

  const storeProfile = JSON.parse(project.store_profile)
  const startPhase = project.current_phase ?? 0

  updateProjectStatus(projectId, 'running')
  insertJobEvent(projectId, 'job:started', null, 'Pipeline started')

  try {
    let context: any = { storeProfile, mode: project.mode, accounts: [], breakdownResult: null }

    for (let i = startPhase; i < PHASES.length; i++) {
      const phase = PHASES[i]
      insertJobEvent(projectId, 'phase:started', i, `阶段 ${i + 1}: ${phase.name}`)
      updateProjectStatus(projectId, 'running', { currentPhase: i })

      context = await phase.fn(projectId, context)

      insertJobEvent(projectId, 'phase:completed', i, `阶段 ${i + 1} 完成`)
      updateProjectStatus(projectId, 'running', { currentPhase: i + 1 })
    }

    updateProjectStatus(projectId, 'completed', { completedAt: new Date().toISOString() })
    insertJobEvent(projectId, 'job:completed', null, 'Pipeline completed')
  } catch (err: any) {
    updateProjectStatus(projectId, 'error', { errorMessage: err.message })
    insertJobEvent(projectId, 'job:error', null, `Pipeline error: ${err.message}`)
    throw err
  } finally {
    await disconnectXhs()
  }
}
