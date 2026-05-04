import { StoreProfile } from '../lib/types'

export function BUILD_CLASSIFY_PROMPT(userProfile: any, storeProfile: StoreProfile): string {
  return `请判断以下小红书账号的类型。

## 目标行业
行业：${storeProfile.industry}
城市：${storeProfile.city}

## 账号信息
- 昵称：${userProfile.nickname}
- 简介：${userProfile.bio ?? '无'}
- 粉丝数：${userProfile.followers ?? 0}
- 笔记数：${userProfile.notesCount ?? 0}

## 近期笔记标题
${(userProfile.notes ?? []).slice(0, 5).map((n: any, i: number) => `${i + 1}. ${n.title ?? '无标题'}`).join('\n')}

## 账号类型定义
- merchant: 商家自营号（本地商家自己运营的账号，发布自家产品/服务内容）
- influencer: 达人探店号（以探店/测评为主要内容的达人）
- deal: 团购引流号（以团购/优惠信息为主的账号）
- user: 素人种草号（普通用户分享体验）
- brand: 品牌/聚合营销号（大型品牌官方号或MCN运营号）

请返回 JSON：
{"type": "merchant|influencer|deal|user|brand", "confidence": 0.0-1.0, "reasoning": "判断依据"}`
}
