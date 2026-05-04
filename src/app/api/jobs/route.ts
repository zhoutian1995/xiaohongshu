import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import * as db from '@/lib/db'
import { CreateJobSchema } from '@/lib/schemas'

export async function POST(req: NextRequest) {
  let rawBody: any
  try {
    rawBody = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const result = CreateJobSchema.safeParse(rawBody)

  if (!result.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: result.error.issues },
      { status: 400 }
    )
  }

  const data = result.data
  const mode = data.mode
  const storeProfile = { ...data }
  delete (storeProfile as any).mode

  const id = randomUUID()
  db.createJob(id, JSON.stringify(storeProfile), mode)
  return NextResponse.json({ id, runStatus: 'queued' }, { status: 201 })
}

export async function GET() {
  const rows = db.getDb().prepare('SELECT id, mode, run_status, created_at FROM jobs ORDER BY created_at DESC LIMIT 20').all()
  return NextResponse.json({ jobs: rows })
}
