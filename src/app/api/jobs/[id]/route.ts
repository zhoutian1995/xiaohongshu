import { NextRequest, NextResponse } from 'next/server'
import * as db from '@/lib/db'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const job = db.getJob(id)
  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }

  const artifacts = db.getArtifacts(id)
  return NextResponse.json({
    ...job,
    artifacts: artifacts.map((a: any) => ({
      ...a,
      data_json: JSON.parse(a.data_json),
    })),
  })
}
