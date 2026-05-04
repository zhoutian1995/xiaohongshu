import { NextRequest, NextResponse } from 'next/server'
import * as db from '@/lib/db'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const project = db.getProject(id)

  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  const accounts = db.getBenchmarkAccounts(id)

  return NextResponse.json({
    ...project,
    store_profile: JSON.parse(project.store_profile),
    accounts: accounts.map((a: any) => ({
      ...a,
      score_json: a.score_json ? JSON.parse(a.score_json) : null,
      notes_json: a.notes_json ? JSON.parse(a.notes_json) : null,
      analysis_json: a.analysis_json ? JSON.parse(a.analysis_json) : null,
    })),
  })
}
