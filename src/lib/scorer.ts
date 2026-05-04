import { BenchmarkScore, StoreProfile, FAST_MODE_WEIGHTS, DEEP_MODE_WEIGHTS } from './types'

export function calculateScore(
  profile: any,
  notes: any[],
  storeProfile: StoreProfile,
  mode: string
): BenchmarkScore {
  const weights = mode === 'fast' ? FAST_MODE_WEIGHTS : DEEP_MODE_WEIGHTS

  const localRelevance = scoreLocalRelevance(profile, notes, storeProfile)
  const industryRelevance = scoreIndustryRelevance(notes, storeProfile)
  const activityScore = scoreActivity(notes)
  const recentHitRate = scoreRecentHitRate(notes)
  const learnability = scoreLearnability(profile, notes)
  const hasOrganicHits = checkOrganicHits(profile, notes)

  // Fast mode: proxy consultCommentRate with favorites/comments ratio
  const consultCommentRate = mode === 'fast'
    ? Math.min(10, avg(notes.map((n: any) => (n.favorites ?? 0) / Math.max(n.comments ?? 0, 1))) / 5 * 10)
    : scoreConsultCommentRate(notes)

  const overallScore = Math.round(
    (localRelevance * weights.localRelevance +
     industryRelevance * weights.industryRelevance +
     consultCommentRate * weights.consultCommentRate +
     activityScore * weights.activityScore +
     recentHitRate * weights.recentHitRate +
     learnability * weights.learnability) * 10
  )

  return {
    localRelevance,
    industryRelevance,
    consultCommentRate,
    activityScore,
    recentHitRate,
    hasOrganicHits,
    learnability,
    overallScore: Math.min(100, overallScore),
  }
}

function scoreLocalRelevance(profile: any, notes: any[], storeProfile: StoreProfile): number {
  const city = storeProfile.city
  const bio = (profile.bio ?? '').toLowerCase()
  let score = 0

  if (bio.includes(city)) score += 5
  const cityMentions = notes.filter((n: any) => (n.title ?? '').includes(city) || (n.content ?? '').includes(city))
  score += Math.min(5, (cityMentions.length / Math.max(notes.length, 1)) * 10)

  return Math.min(10, score)
}

function scoreIndustryRelevance(notes: any[], storeProfile: StoreProfile): number {
  const industry = storeProfile.industry
  const specialties = storeProfile.specialties ?? []
  const keywords = [industry, ...specialties]

  let matchCount = 0
  for (const note of notes) {
    const text = `${note.title ?? ''} ${note.content ?? ''}`
    if (keywords.some(kw => text.includes(kw))) matchCount++
  }

  return Math.min(10, (matchCount / Math.max(notes.length, 1)) * 10)
}

function scoreActivity(notes: any[]): number {
  if (notes.length === 0) return 0
  const now = Date.now()
  const recent30d = notes.filter((n: any) => (n.time ?? 0) * 1000 > now - 30 * 24 * 60 * 60 * 1000)
  const recent90d = notes.filter((n: any) => (n.time ?? 0) * 1000 > now - 90 * 24 * 60 * 60 * 1000)

  // 30d: >4 posts = 10, 2-4 = 7, 1 = 4, 0 = 0
  if (recent30d.length >= 4) return 10
  if (recent30d.length >= 2) return 7
  if (recent30d.length >= 1) return 4
  // Check 90d
  if (recent90d.length >= 8) return 5
  if (recent90d.length >= 4) return 3
  return 1
}

function scoreRecentHitRate(notes: any[]): number {
  if (notes.length < 3) return 5 // Not enough data, give middle score
  const avgLikes = avg(notes.map((n: any) => n.likes ?? 0))
  if (avgLikes === 0) return 3
  const hits = notes.filter((n: any) => (n.likes ?? 0) > avgLikes * 1.5)
  return Math.min(10, (hits.length / notes.length) * 20)
}

function scoreLearnability(profile: any, notes: any[]): number {
  const bio = (profile.bio ?? '').toLowerCase()
  // Large brands with big budgets are less learnable
  if (profile.followers > 100000) return 3
  if (profile.followers > 50000) return 5
  if (profile.followers > 10000) return 7
  return 9 // Small accounts are more learnable
}

function checkOrganicHits(profile: any, notes: any[]): boolean {
  if (profile.followers > 10000) return false // Already big
  return notes.some((n: any) => (n.likes ?? 0) > 1000)
}

function scoreConsultCommentRate(notes: any[]): number {
  // Deep mode: would need actual comment data
  // Placeholder for now
  return 5
}

function avg(nums: number[]): number {
  return nums.length > 0 ? nums.reduce((a, b) => a + b, 0) / nums.length : 0
}
