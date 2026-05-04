import { xhsSearch, xhsUserProfile } from '../xhs-client'
import { xhsLimiter } from '../rate-limiter'
import * as cache from '../cache'
import { StoreProfile, ClassifiedAccount, AccountType } from '../types'
import { classifyAccount } from '../classifier'

export async function discover(projectId: string, context: any) {
  const profile: StoreProfile = context.storeProfile
  const mode: string = context.mode

  // Step 1: Generate keywords
  const keywords = generateSearchKeywords(profile, mode)
  console.log(`[discover] Keywords: ${keywords.join(', ')}`)

  // Step 2: Search and collect candidate accounts
  const candidateIds = new Set<string>()
  for (const keyword of keywords) {
    const cached = cache.getCached<any>(cache.searchKey(keyword))
    if (cached) {
      for (const note of cached.notes ?? []) {
        if (note.authorId) candidateIds.add(note.authorId)
      }
      continue
    }

    await xhsLimiter.wait()
    const result = await xhsSearch(keyword, mode === 'fast' ? 20 : 30)
    cache.setCache(cache.searchKey(keyword), result, cache.SEARCH_TTL)

    for (const note of result.notes ?? []) {
      if (note.authorId) candidateIds.add(note.authorId)
    }
  }

  console.log(`[discover] Found ${candidateIds.size} candidate accounts`)

  // Step 3: Get profiles and classify
  const accounts: ClassifiedAccount[] = []
  for (const userId of candidateIds) {
    const cached = cache.getCached<any>(cache.accountKey(userId))
    let userProfile = cached

    if (!userProfile) {
      await xhsLimiter.wait()
      userProfile = await xhsUserProfile(userId)
      cache.setCache(cache.accountKey(userId), userProfile)
    }

    const classified = await classifyAccount(userProfile, profile)
    accounts.push(classified)
  }

  // Step 4: Filter merchant accounts only
  const merchants = accounts.filter(a => a.accountType === 'merchant')
  console.log(`[discover] Found ${merchants.length} merchant accounts out of ${accounts.length} candidates`)

  return {
    ...context,
    accounts: merchants,
    allCandidates: accounts,
  }
}

function generateSearchKeywords(profile: StoreProfile, mode: string): string[] {
  const keywords: string[] = []

  if (mode === 'fast') {
    // Fast mode: 3 fixed keywords
    keywords.push(`${profile.city}${profile.industry}`)
    keywords.push(`${profile.industry}推荐`)
    keywords.push(`${profile.industry}避雷`)
  } else {
    // Deep mode: full keyword pool
    keywords.push(`${profile.city}${profile.industry}`)
    keywords.push(`${profile.industry}推荐`)
    keywords.push(`${profile.industry}避雷`)
    keywords.push(`${profile.industry}${profile.priceRange}`)
    keywords.push(...profile.specialties.map(s => `${profile.industry}${s}`))
    if (profile.district) {
      keywords.push(`${profile.district}${profile.industry}`)
    }
  }

  return keywords
}
