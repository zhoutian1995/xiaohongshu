import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import * as db from '@/lib/db'

export async function POST(req: NextRequest) {
  const body = await req.json()
  if (!body.storeProfile || !body.mode) {
    return NextResponse.json({ error: 'storeProfile and mode are required' }, { status: 400 })
  }
  const id = randomUUID()
  db.createJob(id, JSON.stringify(body.storeProfile), body.mode)
  return NextResponse.json({ id, runStatus: 'queued' }, { status: 201 })
}

export async function GET() {
  const rows = db.getDb().prepare('SELECT id, mode, run_status, created_at FROM jobs ORDER BY created_at DESC LIMIT 20').all()
  return NextResponse.json({ jobs: rows })
}
