import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import * as db from '@/lib/db'

export async function POST(req: NextRequest) {
  const body = await req.json()

  if (!body.storeProfile || !body.mode) {
    return NextResponse.json({ error: 'storeProfile and mode are required' }, { status: 400 })
  }

  const id = randomUUID()
  db.createProject(id, JSON.stringify(body.storeProfile), body.mode)

  return NextResponse.json({ id, status: 'queued' }, { status: 201 })
}

export async function GET() {
  // List recent projects
  const projects = (db as any).getDb?.()?.prepare('SELECT id, mode, status, created_at FROM projects ORDER BY created_at DESC LIMIT 20').all() ?? []
  return NextResponse.json({ projects })
}
