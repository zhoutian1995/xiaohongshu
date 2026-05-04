'use client'
import { useState, useEffect } from 'react'

export interface TimelineEventRaw {
  id: string
  job_id: string
  event_type: string
  message: string
  data_json?: string
  created_at: string
}

export function useJobStream(jobId: string | null) {
  const [events, setEvents] = useState<TimelineEventRaw[]>([])
  const [isComplete, setIsComplete] = useState(false)
  const [isError, setIsError] = useState(false)

  useEffect(() => {
    if (!jobId) return

    setEvents([])
    setIsComplete(false)
    setIsError(false)

    const es = new EventSource(`/api/jobs/${jobId}/stream`)

    const eventTypes = [
      'job_started', 'tool_called', 'tool_completed', 'artifact_saved',
      'validation_passed', 'validation_failed', 'repair_started',
      'job_completed', 'job_error',
    ]

    for (const type of eventTypes) {
      es.addEventListener(type, (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data)
          setEvents(prev => [...prev, data])
          if (type === 'job_completed') setIsComplete(true)
          if (type === 'job_error') { setIsError(true); es.close() }
        } catch { /* ignore parse errors */ }
      })
    }

    es.onerror = () => es.close()

    return () => es.close()
  }, [jobId])

  return { events, isComplete, isError }
}
