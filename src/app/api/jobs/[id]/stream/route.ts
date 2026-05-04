import { NextRequest } from 'next/server'
import * as db from '@/lib/db'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const url = new URL(req.url)
  const afterId = parseInt(url.searchParams.get('after') ?? '0')

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      let lastEventId = afterId
      let done = false

      const send = (event: string, data: any) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
      }

      // Send initial events
      const initialEvents = db.getTimelineEvents(id, afterId)
      for (const evt of initialEvents) {
        send(evt.event_type, evt)
        lastEventId = evt.id
      }

      // Poll for new events
      const interval = setInterval(() => {
        if (done) return
        const events = db.getTimelineEvents(id, lastEventId)
        for (const evt of events) {
          send(evt.event_type, evt)
          lastEventId = evt.id
          if (evt.event_type === 'job_completed' || evt.event_type === 'job_error') {
            done = true
            clearInterval(interval)
            controller.close()
          }
        }
      }, 1000)

      // Timeout after 15 minutes
      setTimeout(() => {
        if (!done) { done = true; clearInterval(interval); controller.close() }
      }, 15 * 60 * 1000)

      req.signal.addEventListener('abort', () => {
        done = true; clearInterval(interval)
        try { controller.close() } catch {}
      })
    },
  })

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' },
  })
}
