import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

let client: Client | null = null
let transport: StdioClientTransport | null = null
let connecting: Promise<Client> | null = null

// Connection lifecycle management
async function getClient(): Promise<Client> {
  // If already connected, verify connection is alive
  if (client) {
    try {
      await client.ping()
      return client
    } catch {
      // Connection dead, clean up and reconnect
      await forceDisconnect()
    }
  }

  // Prevent concurrent connection attempts
  if (connecting) return connecting

  connecting = (async () => {
    transport = new StdioClientTransport({
      command: 'npx',
      args: ['-y', '@sillyl12324/xhs-mcp@latest'],
      env: {
        PATH: process.env.PATH ?? '',
        HOME: process.env.HOME ?? '',
        NODE_ENV: process.env.NODE_ENV ?? 'production',
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
    connecting = null
    return client
  })()

  try {
    return await connecting
  } catch (err) {
    connecting = null
    await forceDisconnect()
    throw err
  }
}

async function forceDisconnect(): Promise<void> {
  try {
    if (client) await client.close()
  } catch { /* ignore */ }
  client = null
  transport = null
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

// Response validation
function validateSearchResult(data: any): XhsSearchResult {
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid search result: expected object')
  }
  if (!Array.isArray(data.notes)) {
    // Try to handle alternative formats
    if (Array.isArray(data.items)) data.notes = data.items
    else if (Array.isArray(data.data)) data.notes = data.data
    else throw new Error('Invalid search result: missing notes array')
  }
  return data as XhsSearchResult
}

function validateUserProfile(data: any): XhsUserProfile {
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid user profile: expected object')
  }
  if (!data.userId && !data.user_id) {
    throw new Error('Invalid user profile: missing userId')
  }
  return data as XhsUserProfile
}

function validateNote(data: any): XhsNote {
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid note: expected object')
  }
  if (!data.noteId && !data.note_id) {
    throw new Error('Invalid note: missing noteId')
  }
  return data as XhsNote
}

export async function xhsSearch(keyword: string, limit = 20): Promise<XhsSearchResult> {
  const c = await getClient()
  const result = await c.callTool({
    name: 'xhs_search',
    arguments: { keyword, sort: 'general', noteType: '0' },
  })
  const parsed = parseResult(result)
  return validateSearchResult(parsed)
}

export async function xhsUserProfile(userId: string): Promise<XhsUserProfile> {
  const c = await getClient()
  const result = await c.callTool({
    name: 'xhs_user_profile',
    arguments: { userId },
  })
  const parsed = parseResult(result)
  return validateUserProfile(parsed)
}

export async function xhsGetNote(noteId: string, xsecToken: string): Promise<XhsNote> {
  const c = await getClient()
  const result = await c.callTool({
    name: 'xhs_get_note',
    arguments: { noteId, xsecToken },
  })
  const parsed = parseResult(result)
  return validateNote(parsed)
}

export async function xhsUserNotes(userId: string, cursor = '', limit = 30): Promise<{ notes: XhsNote[]; cursor: string }> {
  const c = await getClient()
  const result = await c.callTool({
    name: 'xhs_user_profile',
    arguments: { userId, cursor, limit },
  })
  const parsed = parseResult(result)
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid user notes response')
  }
  return parsed
}

// Login pre-check: try a lightweight operation to verify session is valid
export async function checkLoginStatus(): Promise<boolean> {
  try {
    const c = await getClient()
    // Try a minimal search to verify login state
    const result = await c.callTool({
      name: 'xhs_search',
      arguments: { keyword: 'test', sort: 'general', noteType: '0' },
    })
    const parsed = parseResult(result)
    // If we get any response (even empty), login is valid
    return parsed !== null && typeof parsed === 'object'
  } catch {
    return false
  }
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
  await forceDisconnect()
}
