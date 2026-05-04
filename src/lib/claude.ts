import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

export async function askClaude(
  prompt: string,
  systemPrompt: string,
  options?: {
    maxTokens?: number
    model?: string
  }
): Promise<string> {
  const response = await client.messages.create({
    model: options?.model ?? 'claude-sonnet-4-20250514',
    max_tokens: options?.maxTokens ?? 4096,
    system: systemPrompt,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = response.content[0]
  if (text.type !== 'text') {
    throw new Error('Unexpected response type from Claude')
  }
  return text.text
}

export async function askClaudeJSON<T>(
  prompt: string,
  systemPrompt: string,
  options?: {
    maxTokens?: number
    model?: string
  }
): Promise<T> {
  const raw = await askClaude(prompt, systemPrompt, options)

  // Extract JSON from possible markdown code blocks
  const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/) ?? [null, raw]
  const jsonStr = jsonMatch[1].trim()

  return JSON.parse(jsonStr) as T
}

export { client }
