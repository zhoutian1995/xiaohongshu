import { StoreProfile, ClassifiedAccount, AccountType } from './types'
import { claudeLimiter } from './rate-limiter'
import { askClaudeJSON } from './claude'
import { BUILD_CLASSIFY_PROMPT } from '../prompts/classify-account'

export async function classifyAccount(userProfile: any, storeProfile: StoreProfile): Promise<ClassifiedAccount> {
  const bio = (userProfile.bio ?? '').toLowerCase()
  const nickname = userProfile.nickname ?? ''
  const notes = userProfile.notes ?? []

  // Step 1: Rule-based pre-filter
  const ruleResult = preFilterAccount(bio, nickname, notes)

  if (ruleResult.type !== 'uncertain') {
    return {
      userId: userProfile.userId,
      nickname,
      avatar: userProfile.avatar ?? '',
      followers: userProfile.followers ?? 0,
      notesCount: userProfile.notesCount ?? 0,
      accountType: ruleResult.type,
      classificationMethod: 'rule',
      classificationEvidence: ruleResult.reason,
    }
  }

  // Step 2: AI classification for uncertain accounts
  await claudeLimiter.wait()
  const prompt = BUILD_CLASSIFY_PROMPT(userProfile, storeProfile)
  const aiResult = await askClaudeJSON<{ type: AccountType; confidence: number; reasoning: string }>(
    prompt,
    '你是一个小红书账号类型分类器。请根据账号信息判断类型。'
  )

  return {
    userId: userProfile.userId,
    nickname,
    avatar: userProfile.avatar ?? '',
    followers: userProfile.followers ?? 0,
    notesCount: userProfile.notesCount ?? 0,
    accountType: aiResult.type,
    classificationMethod: 'ai',
    classificationEvidence: aiResult.reasoning,
  }
}

function preFilterAccount(bio: string, nickname: string, notes: any[]): { type: AccountType | 'uncertain'; reason: string } {
  // Merchant signals
  if (bio.includes('预约') || bio.includes('地址') || bio.includes('营业') || bio.includes('到店')) {
    return { type: 'merchant', reason: '简介包含预约/地址/营业/到店关键词' }
  }

  // Influencer signals
  if (bio.includes('探店') || bio.includes('合作私信') || bio.includes('达人')) {
    return { type: 'influencer', reason: '简介包含探店/合作/达人关键词' }
  }

  // Brand signals
  if (isInstitutionName(nickname)) {
    return { type: 'brand', reason: '昵称疑似机构名/品牌名' }
  }

  // Check notes for deal patterns
  if (notes.length > 0 && notes.filter((n: any) => n.title?.includes('团购') || n.title?.includes('秒杀')).length / notes.length > 0.7) {
    return { type: 'deal', reason: '超过70%笔记为团购/秒杀内容' }
  }

  // Check for repeated store mentions in notes
  if (notesHaveSameStore(notes)) {
    return { type: 'merchant', reason: '笔记中反复出现同一门店信息' }
  }

  return { type: 'uncertain', reason: '规则无法判定，需AI精分' }
}

function isInstitutionName(name: string): boolean {
  const brandPatterns = [/官方/, /旗舰店/, /连锁/, /总部/, /集团/, /\.com$/i]
  return brandPatterns.some(p => p.test(name))
}

function notesHaveSameStore(notes: any[]): boolean {
  if (notes.length < 3) return false
  const storeMentions = notes.filter((n: any) => n.content?.includes('门店') || n.content?.includes('店面') || n.content?.includes('到店'))
  return storeMentions.length >= 3
}
