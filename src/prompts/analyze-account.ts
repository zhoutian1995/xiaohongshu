import { StoreProfile } from '../lib/types'

export function BUILD_ANALYZE_PROMPT(account: any, storeProfile: StoreProfile): string {
  return `请深度分析以下小红书对标账号。

## 我们的目标
行业：${storeProfile.industry}
城市：${storeProfile.city}
我们的定位：${storeProfile.storeName}，${storeProfile.specialties.join('、')}

## 对标账号信息
- 昵称：${account.nickname}
- 粉丝：${account.followers}
- 笔记数：${account.notesCount}
- 近30天发布：${account.notesLast30d}篇
- 平均点赞：${account.avgLikes.toFixed(0)}
- 平均评论：${account.avgComments.toFixed(0)}
- 平均收藏：${account.avgFavorites.toFixed(0)}
- 评分：${account.score.overallScore}/100

## 近期笔记（${account.notes.length}篇）
${account.notes.slice(0, 10).map((n: any, i: number) => `${i + 1}. [${n.likes ?? 0}赞] ${n.title ?? '无标题'}`).join('\n')}

## 分析要求
每个结论必须附带证据引用（evidence），格式为：
{"noteId": "xxx", "title": "笔记标题", "relevantData": "相关数据"}

请返回 JSON：
{
  "positioning": "账号定位描述",
  "targetAudience": "目标人群",
  "differentiation": "差异化卖点",
  "contentTypes": [{"type": "内容类型", "percentage": 45, "avgEngagement": 1200, "evidence": [...]}],
  "postingFrequency": "发布频率描述",
  "postingTimePattern": "发布时间规律",
  "hitPatterns": ["爆款共性1", "爆款共性2"],
  "evidenceList": [{"conclusion": "结论", "evidence": [...], "metric": "数据支撑"}]
}`
}
