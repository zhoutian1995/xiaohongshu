// xhs-mcp 完整登录流程 v3
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

async function main() {
  const transport = new StdioClientTransport({
    command: 'npx',
    args: ['-y', '@sillyl12324/xhs-mcp@latest'],
    env: {
      PATH: process.env.PATH ?? '',
      HOME: process.env.HOME ?? '',
      XHS_MCP_DATA_DIR: `${process.env.HOME}/.xhs-mcp`,
      XHS_MCP_HEADLESS: 'false',
    },
  })

  const client = new Client(
    { name: 'xhs-login-helper', version: '1.0.0' },
    { capabilities: {} }
  )

  console.log('连接 xhs-mcp...')
  await client.connect(transport)

  // Step 1: 添加账号
  console.log('\n--- 生成登录二维码 ---')
  const addResult = await client.callTool({
    name: 'xhs_add_account',
    arguments: { method: 'qrcode' },
  })
  const addText = addResult.content?.find(c => c.type === 'text')?.text || ''

  let sessionId = '', qrCodeUrl = ''
  try {
    const data = JSON.parse(addText)
    sessionId = data.sessionId
    qrCodeUrl = data.qrCodeUrl
  } catch {}

  console.log('二维码:', qrCodeUrl)
  console.log('Session:', sessionId)
  console.log('\n请用小红书 App 扫描二维码登录！')

  // Step 2: 轮询直到 confirmed 或失败
  let loggedIn = false
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 5000))
    try {
      const r = await client.callTool({
        name: 'xhs_check_login_session',
        arguments: { sessionId },
      })
      const t = r.content?.find(c => c.type === 'text')?.text || ''
      let data
      try { data = JSON.parse(t) } catch {}

      const status = data?.status || ''
      console.log(`[${(i+1)*5}s] status=${status}`)

      if (status === 'confirmed' || status === 'logged_in' || status === 'success') {
        console.log('\n登录确认成功！')
        loggedIn = true
        break
      }
      if (status === 'expired' || status === 'timeout' || status === 'failed') {
        console.log('\n二维码过期或失败')
        break
      }
      // 如果有 confirmed 字段
      if (data?.confirmed === true || data?.accountAdded === true) {
        console.log('\n账号已确认！')
        loggedIn = true
        break
      }
    } catch (e) {
      console.log(`[${(i+1)*5}s] 错误:`, e.message?.slice(0, 80))
    }
  }

  if (!loggedIn) {
    // 尝试 confirm
    console.log('\n--- 尝试确认登录 ---')
    try {
      const confirmResult = await client.callTool({
        name: 'xhs_confirm_login',
        arguments: { sessionId },
      })
      const ct = confirmResult.content?.find(c => c.type === 'text')?.text || ''
      console.log('确认结果:', ct.slice(0, 300))
    } catch (e) {
      console.log('确认失败:', e.message?.slice(0, 100))
    }
  }

  // Step 3: 最终状态
  console.log('\n--- 最终状态 ---')
  const statusResult = await client.callTool({
    name: 'xhs_check_auth_status',
    arguments: {},
  })
  const st = statusResult.content?.find(c => c.type === 'text')?.text || ''
  console.log(st)

  await client.close()
  process.exit(loggedIn ? 0 : 1)
}

main().catch(e => {
  console.error('错误:', e.message)
  process.exit(1)
})
