import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

let client: Client | null = null
let transport: StdioClientTransport | null = null

async function getClient(): Promise<Client> {
  if (client) return client

  transport = new StdioClientTransport({
    command: 'npx',
    args: ['-y', '@sillyl12324/xhs-mcp@latest'],
    env: {
      ...process.env,
      XHS_MCP_DATA_DIR: process.env.XHS_MCP_DATA_DIR ?? `${process.env.HOME}/.xhs-mcp`,
      XHS_MCP_HEADLESS: 'true',
      XHS_MCP_REQUEST_INTERVAL: '2000',
    },
  })

  client = new Client(
    { name: 'xhs-benchmark-tool', version: '0.1.0' },
    { capabilities: {} }
  )

  await client.connect(transport)
  return client
}

// --- XHS MCP 工具封装 ---

export interface XhsSearchResult {
  notes: Array<{
    noteId: string
    title: string
    authorNickname: string
    authorId: string
    likes: number
    type: string
  }>
}

export interface XhsUserProfile {
  userId: string
  nickname: string
  avatar: string
  bio: string
  followers: number
  following: number
  notesCount: number
  likes: number
}

export interface XhsNote {
  noteId: string
  title: string
  content: string
  type: string
  likes: number
  comments: number
  favorites: number
  shareCount: number
  tags: string[]
  time: number
  user: {
    userId: string
    nickname: string
  }
}

export async function xhsSearch(keyword: string, limit = 20): Promise<XhsSearchResult> {
  const c = await getClient()
  const result = await c.callTool({
    name: 'xhs_search',
    arguments: { keyword, sort: 'general', noteType: '0' },
  })
  return parseResult(result)
}

export async function xhsUserProfile(userId: string): Promise<XhsUserProfile> {
  const c = await getClient()
  const result = await c.callTool({
    name: 'xhs_user_profile',
    arguments: { userId },
  })
  return parseResult(result)
}

export async function xhsGetNote(noteId: string, xsecToken: string): Promise<XhsNote> {
  const c = await getClient()
  const result = await c.callTool({
    name: 'xhs_get_note',
    arguments: { noteId, xsecToken },
  })
  return parseResult(result)
}

export async function xhsUserNotes(userId: string, cursor = '', limit = 30): Promise<{ notes: XhsNote[]; cursor: string }> {
  const c = await getClient()
  const result = await c.callTool({
    name: 'xhs_user_profile',
    arguments: { userId, cursor, limit },
  })
  return parseResult(result)
}

// --- 辅助 ---

function parseResult(result: unknown): any {
  if (typeof result === 'object' && result !== null && 'content' in result) {
    const content = (result as any).content
    if (Array.isArray(content) && content.length > 0) {
      const text = content.find((c: any) => c.type === 'text')
      if (text?.text) {
        try {
          return JSON.parse(text.text)
        } catch {
          return text.text
        }
      }
    }
  }
  return result
}

export async function disconnectXhs(): Promise<void> {
  if (client) {
    await client.close()
    client = null
    transport = null
  }
}
