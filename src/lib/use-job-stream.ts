'use client'
import { useState, useEffect, useRef } from 'react'

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
  const lastEventIdRef = useRef<number>(0)

  useEffect(() => {
    if (!jobId) return

    setEvents([])
    setIsComplete(false)
    setIsError(false)
    lastEventIdRef.current = 0

    let reconnectTimer: ReturnType<typeof setTimeout> | null = null

    function connect() {
      const es = new EventSource(`/api/jobs/${jobId}/stream`)

      const eventTypes = [
        'job_started', 'tool_called', 'tool_completed', 'artifact_saved',
        'validation_passed', 'validation_failed', 'repair_started',
        'job_completed', 'job_error', 'heartbeat',
      ]

      for (const type of eventTypes) {
        es.addEventListener(type, (e: MessageEvent) => {
          if (type === 'heartbeat') return // ignore heartbeats

          try {
            const data = JSON.parse(e.data)
            lastEventIdRef.current = data.id ?? lastEventIdRef.current
            setEvents(prev => [...prev, data])
            if (type === 'job_completed') { setIsComplete(true); es.close() }
            if (type === 'job_error') { setIsError(true); es.close() }
          } catch { /* ignore parse errors */ }
        })
      }

      es.onerror = () => {
        es.close()
        // Auto-reconnect after 2s if not complete/error (INFRA-03)
        if (!isComplete && !isError) {
          reconnectTimer = setTimeout(connect, 2000)
        }
      }
    }

    connect()

    return () => {
      if (reconnectTimer) clearTimeout(reconnectTimer)
    }
  }, [jobId])

  return { events, isComplete, isError }
}
