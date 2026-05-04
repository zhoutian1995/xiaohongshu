export function BUILD_BREAKDOWN_PROMPT(account: any, hitGroup: any[], avgGroup: any[]): string {
  return `请对比分析以下两组笔记，找出爆款和普通笔记的脚本结构差异。

## 账号
${account.nickname}（粉丝 ${account.followers}）

## 爆款组（${hitGroup.length}篇，互动最高）
${hitGroup.map((n: any, i: number) => `${i + 1}. [${n.likes ?? 0}赞 ${n.comments ?? 0}评] ${n.title ?? '无标题'}
   内容摘要：${(n.content ?? '').slice(0, 100)}...`).join('\n\n')}

## 普通组（${avgGroup.length}篇，互动最低）
${avgGroup.map((n: any, i: number) => `${i + 1}. [${n.likes ?? 0}赞 ${n.comments ?? 0}评] ${n.title ?? '无标题'}
   内容摘要：${(n.content ?? '').slice(0, 100)}...`).join('\n\n')}

## 分析要求
对比两组笔记在标题公式、封面风格、钩子技巧、CTA话术上的差异。

请返回 JSON：
{
  "hitPatterns": [{"titleFormula": "标题公式", "coverStyle": "封面风格", "hookTechnique": "钩子技巧", "ctaTechnique": "CTA话术", "evidence": [...]}],
  "averagePatterns": [{"titleFormula": "...", "coverStyle": "...", "hookTechnique": "...", "ctaTechnique": "...", "evidence": [...]}],
  "differenceFactors": [{"dimension": "对比维度", "hitBehavior": "爆款表现", "averageBehavior": "普通表现", "impact": "影响程度"}],
  "reusableTemplates": [{"name": "模板名", "structure": ["步骤1", "步骤2", "..."], "applicableScenarios": "适用场景", "referenceNotes": [...]}]
}`
}
