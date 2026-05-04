import { StoreProfile } from '../lib/types'

export function BUILD_GENERATE_PROMPT(storeProfile: StoreProfile, accounts: any[], breakdownResult: any[], scriptCount: number): string {
  return `请为以下门店生成小红书首周内容策略。

## 门店信息
- 店名：${storeProfile.storeName}
- 行业：${storeProfile.industry}
- 城市：${storeProfile.city} ${storeProfile.district ?? ''}
- 客单价：${storeProfile.priceRange}
- 目标客群：${storeProfile.targetAudience}
- 商圈：${storeProfile.businessArea}
- 擅长项目：${storeProfile.specialties.join('、')}
- 真实优势：${storeProfile.realAdvantages.join('、')}
- 可拍素材：${storeProfile.filmableAssets.join('、')}
- 出镜：${storeProfile.onCamera ? `是（${storeProfile.onCameraInfo ?? '员工/老板'}）` : '不出镜'}
- 发布频率：${storeProfile.postFrequency}
- 转化方式：${storeProfile.conversionMethod}
${storeProfile.forbiddenTopics?.length ? `- 禁忌表达：${storeProfile.forbiddenTopics.join('、')}` : ''}

## 对标账号分析（${accounts.length}个）
${accounts.map((a: any) => `- ${a.nickname}（粉丝${a.followers}）：定位「${a.analysis?.positioning ?? '未分析'}」，差异化「${a.analysis?.differentiation ?? '未分析'}」`).join('\n')}

## 脚本拆解发现
${breakdownResult.map((b: any) => {
  const templates = b.breakdown?.reusableTemplates ?? []
  const factors = b.breakdown?.differenceFactors ?? []
  return `### ${b.account.nickname}
差异因子：${factors.map((f: any) => `${f.dimension}: 爆款${f.hitBehavior} vs 普通${f.averageBehavior}`).join('；')}
可复用模板：${templates.map((t: any) => t.name).join('、')}`
}).join('\n\n')}

## 核心约束
1. 学习结构，不复用表达 — 不要复制竞品的具体文案、标题、封面设计
2. 脚本必须基于门店真实素材和条件
3. 不生成门店无法执行的脚本
4. 每条脚本标注参考了对标的哪些笔记

请返回 JSON：
{
  "positioning": "账号定位建议",
  "positioningEvidence": [{"noteId": "xxx", "title": "...", "url": "...", "relevantData": "..."}],
  "weekPlan": [{"day": 1, "task": "拍什么", "shootingNotes": "怎么拍", "onCamera": "谁出镜"}],
  "topicPool": [{"title": "选题", "sourceAccount": "来源账号", "sourceNoteId": "来源笔记ID", "engagement": 1234}],
  "scripts": [{"title": "标题", "coverDescription": "封面怎么拍", "copy": "正文逐字稿", "shootingChecklist": ["清单项1"], "tags": ["标签1"], "referenceNotes": [...]}],
  "tagLibrary": [{"category": "分类", "tags": ["标签1", "标签2"]}]
}`
}
