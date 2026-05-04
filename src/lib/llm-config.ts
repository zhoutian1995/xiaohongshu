// LLM configuration — reads from env vars, with coding plan defaults
// For local dev, create .env.local with these vars (security hook blocks auto-creation)

export const LLM_CONFIG = {
  apiKey: process.env.ZHIPU_API_KEY ?? '',
  baseURL: process.env.ZHIPU_BASE_URL ?? 'https://open.bigmodel.cn/api/coding/paas/v4',
  model: process.env.LLM_MODEL ?? 'glm-5-turbo',
}
