import type { ToolDefinition, ToolContext } from '../types'
import { xhsSearch, xhsUserProfile, xhsGetNote } from '../xhs-client'
import { xhsLimiter } from '../rate-limiter'
import * as cache from '../cache'

export const xhsSearchTool: ToolDefinition = {
  name: 'xhs_search',
  description: '搜索小红书笔记。输入关键词返回笔记列表，包含作者信息。用于发现候选对标账号。',
  inputSchema: {
    type: 'object',
    properties: {
      keyword: { type: 'string', description: '搜索关键词' },
      limit: { type: 'number', description: '返回数量，默认20', default: 20 },
    },
    required: ['keyword'],
  },
  handler: async (input, ctx) => {
    const cached = cache.getCached<any>(cache.searchKey(input.keyword))
    if (cached) return cached

    await xhsLimiter.wait()
    const result = await xhsSearch(input.keyword, input.limit ?? 20)
    cache.setCache(cache.searchKey(input.keyword), result, cache.SEARCH_TTL)
    return result
  },
}

export const xhsUserProfileTool: ToolDefinition = {
  name: 'xhs_user_profile',
  description: '获取小红书用户资料（昵称、简介、粉丝数、笔记列表）。用于了解候选账号详情。',
  inputSchema: {
    type: 'object',
    properties: {
      userId: { type: 'string', description: '用户ID' },
    },
    required: ['userId'],
  },
  handler: async (input, ctx) => {
    const cached = cache.getCached<any>(cache.accountKey(input.userId))
    if (cached) return cached

    await xhsLimiter.wait()
    const result = await xhsUserProfile(input.userId)
    cache.setCache(cache.accountKey(input.userId), result)
    return result
  },
}

export const xhsGetNoteTool: ToolDefinition = {
  name: 'xhs_get_note',
  description: '获取小红书笔记详情（标题、正文、互动数据、标签、评论）。用于证据绑定的详细分析。',
  inputSchema: {
    type: 'object',
    properties: {
      noteId: { type: 'string', description: '笔记ID' },
      xsecToken: { type: 'string', description: '安全令牌（可从搜索结果获取）' },
    },
    required: ['noteId', 'xsecToken'],
  },
  handler: async (input, ctx) => {
    await xhsLimiter.wait()
    return await xhsGetNote(input.noteId, input.xsecToken)
  },
}
