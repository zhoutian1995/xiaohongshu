import type { ToolDefinition, ToolContext } from '../types'
import { xhsSearch, xhsUserProfile, xhsGetNote, checkLoginStatus } from '../xhs-client'
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
    try {
      const result = await xhsSearch(input.keyword, input.limit ?? 20)
      cache.setCache(cache.searchKey(input.keyword), result, cache.SEARCH_TTL)
      return result
    } catch (err: any) {
      if (err.message?.includes('Invalid search result')) {
        return { error: '搜索结果为空或格式异常，请换关键词重试', keyword: input.keyword }
      }
      throw err
    }
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
    try {
      const result = await xhsUserProfile(input.userId)
      cache.setCache(cache.accountKey(input.userId), result)
      return result
    } catch (err: any) {
      if (err.message?.includes('Invalid user profile')) {
        return { error: '用户资料获取失败或格式异常', userId: input.userId }
      }
      throw err
    }
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
    try {
      return await xhsGetNote(input.noteId, input.xsecToken)
    } catch (err: any) {
      if (err.message?.includes('Invalid note')) {
        return { error: '笔记详情获取失败或格式异常', noteId: input.noteId }
      }
      throw err
    }
  },
}

export const xhsLoginCheckTool: ToolDefinition = {
  name: 'xhs_login_check',
  description: '检查小红书登录状态。在开始采集前调用，确认登录态有效。',
  inputSchema: {
    type: 'object',
    properties: {},
  },
  handler: async (input, ctx) => {
    try {
      const loggedIn = await checkLoginStatus()
      return { loggedIn, message: loggedIn ? '小红书登录态有效' : '小红书未登录或登录已过期，请先扫码登录' }
    } catch (err: any) {
      return { loggedIn: false, message: `登录检查失败: ${err.message}` }
    }
  },
}
