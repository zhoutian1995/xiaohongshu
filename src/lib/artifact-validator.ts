import * as db from './db'
import type { ValidationResult } from './types'

export function validateJobArtifacts(jobId: string): ValidationResult {
  const artifacts = db.getArtifacts(jobId)
  const errors: string[] = []

  const byType = new Map<string, any[]>()
  for (const a of artifacts) {
    const data = JSON.parse(a.data_json)
    if (!byType.has(a.type)) byType.set(a.type, [])
    byType.get(a.type)!.push(data)
  }

  // 1. Check benchmark_accounts
  const benchmarks = byType.get('benchmark_accounts') ?? []
  if (benchmarks.length === 0) {
    errors.push('缺少 benchmark_accounts 产物')
  } else {
    const accounts = benchmarks.flatMap((b: any) => b.accounts ?? [])
    const merchants = accounts.filter((a: any) => a.classification?.type === 'merchant' || a.accountType === 'merchant')
    if (merchants.length < 3) {
      errors.push(`商家自营账号不足3个（当前${merchants.length}个）`)
    }
  }

  // 2. Check account_analysis evidence
  const analyses = byType.get('account_analysis') ?? []
  if (analyses.length === 0) {
    errors.push('缺少 account_analysis 产物')
  } else {
    for (const a of analyses) {
      const accounts = a.accounts ?? []
      for (const acc of accounts) {
        const evidenceList = acc.analysis?.evidenceList ?? []
        const noEvidence = evidenceList.filter((e: any) => !e.evidence || e.evidence.length === 0)
        if (noEvidence.length > 0) {
          errors.push(`账号 ${acc.userId} 有 ${noEvidence.length} 个结论缺少证据引用`)
        }
      }
    }
  }

  // 3. Check content_strategy scripts
  const strategies = byType.get('content_strategy') ?? []
  if (strategies.length === 0) {
    errors.push('缺少 content_strategy 产物')
  } else {
    const s = strategies[0]
    const scripts = s.scripts ?? []
    if (scripts.length < 2) {
      errors.push(`可拍脚本不足2条（当前${scripts.length}条）`)
    }
    for (const script of scripts) {
      if (!script.shootingChecklist || script.shootingChecklist.length === 0) {
        errors.push(`脚本"${script.title}"缺少 shootingChecklist`)
      }
      if (!script.referenceNotes || script.referenceNotes.length === 0) {
        errors.push(`脚本"${script.title}"缺少 referenceNotes`)
      }
    }
  }

  // 4. Cross-artifact: script referenceNotes should exist in benchmark data
  if (strategies.length > 0 && benchmarks.length > 0) {
    const allNoteIds = new Set(
      benchmarks.flatMap((b: any) => (b.accounts ?? []).flatMap((a: any) => (a.notes ?? []).map((n: any) => n.noteId)))
    )
    for (const s of strategies) {
      for (const script of (s.scripts ?? [])) {
        for (const ref of (script.referenceNotes ?? [])) {
          if (ref.noteId && !allNoteIds.has(ref.noteId)) {
            errors.push(`脚本"${script.title}"引用了不存在的笔记 ${ref.noteId}`)
          }
        }
      }
    }
  }

  return {
    passed: errors.length === 0,
    errors,
  }
}
