'use client'
import { useState } from 'react'
import { StoreProfileForm } from '@/components/StoreProfileForm'
import { AgentTimeline } from '@/components/AgentTimeline'
import { ResultPanel } from '@/components/ResultPanel'
import type { StoreProfile, JobMode } from '@/lib/types'

type PageState = 'idle' | 'running' | 'completed' | 'error'

export default function Home() {
  const [state, setState] = useState<PageState>('idle')
  const [jobId, setJobId] = useState<string | null>(null)

  const handleSubmit = async (profile: StoreProfile, mode: JobMode) => {
    try {
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeProfile: profile, mode }),
      })
      const data = await res.json()
      if (res.ok) {
        setJobId(data.id)
        setState('running')
      }
    } catch {
      // TODO: show error
    }
  }

  const reset = () => {
    setState('idle')
    setJobId(null)
  }

  return (
    <div className="min-h-screen bg-background">
      {state === 'idle' && <StoreProfileForm onSubmit={handleSubmit} />}
      {state === 'running' && jobId && (
        <AgentTimeline
          jobId={jobId}
          onComplete={() => setState('completed')}
          onError={() => setState('error')}
          onNewTask={reset}
        />
      )}
      {(state === 'completed' || state === 'error') && jobId && (
        <ResultPanel jobId={jobId} onNewTask={reset} />
      )}
    </div>
  )
}
