// 确认 xhs-mcp 登录状态
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

async function main() {
  const transport = new StdioClientTransport({
    command: 'npx',
    args: ['-y', '@sillyl12324/xhs-mcp@2.7.0'],
    env: {
      PATH: process.env.PATH ?? '',
      HOME: process.env.HOME ?? '',
      XHS_MCP_DATA_DIR: `${process.env.HOME}/.xhs-mcp`,
      XHS_MCP_HEADLESS: 'true',
    },
  })

  const client = new Client(
    { name: 'xhs-login-check', version: '1.0.0' },
    { capabilities: {} }
  )

  await client.connect(transport)

  const result = await client.callTool({
    name: 'xhs_check_auth_status',
    arguments: {},
  })
  const text = result.content?.find(c => c.type === 'text')?.text || ''
  console.log(text)

  // 试试搜索
  if (text.includes('loggedIn') || text.includes('已登录')) {
    console.log('\n--- 测试搜索 ---')
    const searchResult = await client.callTool({
      name: 'xhs_search',
      arguments: { keyword: '杭州皮肤管理', sort: 'general', noteType: 'all' },
    })
    const searchText = searchResult.content?.find(c => c.type === 'text')?.text || ''
    console.log('搜索结果:', searchText.slice(0, 300))
  }

  await client.close()
  process.exit(0)
}

main().catch(e => {
  console.error('错误:', e.message)
  process.exit(1)
})
