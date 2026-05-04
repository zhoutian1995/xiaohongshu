'use client'
import { useEffect } from 'react'
import { useJobStream, type TimelineEventRaw } from '@/lib/use-job-stream'

interface Props {
  jobId: string
  onComplete: () => void
  onError: () => void
  onNewTask: () => void
}

export function AgentTimeline({ jobId, onComplete, onError, onNewTask }: Props) {
  const { events, isComplete, isError } = useJobStream(jobId)

  useEffect(() => {
    if (isComplete) onComplete()
  }, [isComplete, onComplete])

  useEffect(() => {
    if (isError) onError()
  }, [isError, onError])

  const lastEvent = events[events.length - 1]

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-xl px-6 py-16">
        {/* Header */}
        <div className="mb-8">
          <button onClick={onNewTask} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
            &larr; 新建任务
          </button>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight text-foreground">
            Agent 执行中
          </h1>
          <p className="mt-1 text-xs text-muted-foreground font-mono">
            {jobId.slice(0, 8)}
          </p>
        </div>

        {/* Status */}
        <div className="mb-8 flex items-center gap-3">
          <span className={`size-2.5 rounded-full ${isComplete ? 'bg-green-600' : isError ? 'bg-red-500' : 'bg-blue-500 animate-pulse'}`} />
          <span className="text-sm text-muted-foreground">
            {isComplete ? '任务完成' : isError ? '任务失败' : lastEvent?.message ?? '等待中...'}
          </span>
        </div>

        {/* Timeline */}
        <div className="space-y-0">
          {events.map((evt, i) => (
            <TimelineItem key={evt.id} event={evt} isLast={i === events.length - 1 && !isComplete && !isError} />
          ))}
        </div>

        {/* Running indicator */}
        {!isComplete && !isError && events.length > 0 && (
          <div className="mt-6 flex items-center gap-2 text-xs text-muted-foreground">
            <span className="size-1.5 rounded-full bg-blue-500 animate-pulse" />
            Agent 正在执行...
          </div>
        )}
      </div>
    </div>
  )
}

function TimelineItem({ event, isLast }: { event: TimelineEventRaw; isLast: boolean }) {
  const typeConfig: Record<string, { icon: string; color: string }> = {
    job_started: { icon: 'S', color: 'bg-primary text-primary-foreground' },
    tool_called: { icon: 'T', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' },
    tool_completed: { icon: 'T', color: 'bg-secondary text-secondary-foreground' },
    artifact_saved: { icon: 'A', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300' },
    validation_passed: { icon: 'V', color: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' },
    validation_failed: { icon: 'V', color: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300' },
    repair_started: { icon: 'R', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300' },
    job_completed: { icon: 'C', color: 'bg-green-600 text-white' },
    job_error: { icon: 'E', color: 'bg-red-500 text-white' },
  }

  const config = typeConfig[event.event_type] ?? { icon: '?', color: 'bg-secondary text-secondary-foreground' }
  const time = new Date(event.created_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

  return (
    <div className="flex gap-3 pb-4">
      <div className="flex flex-col items-center">
        <div className={`flex size-6 items-center justify-center rounded-full text-[10px] font-medium ${config.color} ${isLast ? 'ring-2 ring-ring/20' : ''}`}>
          {config.icon}
        </div>
        <div className="w-px flex-1 bg-border" />
      </div>
      <div className="flex-1 pb-2">
        <div className="text-sm text-foreground">{event.message}</div>
        <div className="mt-0.5 text-xs text-muted-foreground">{time}</div>
      </div>
    </div>
  )
}
