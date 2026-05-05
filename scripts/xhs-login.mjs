// 从已登录的 Chrome 浏览器中提取小红书 cookies，保存为 Playwright storageState 格式
import { chromium } from 'playwright';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

const XHS_MCP_DATA_DIR = process.env.XHS_MCP_DATA_DIR || `${os.homedir()}/.xhs-mcp`;
const AUTH_PATH = path.join(XHS_MCP_DATA_DIR, 'auth.json');

// 方法1: 使用 Chrome DevTools Protocol 连接正在运行的 Chrome
// 方法2: 读取 Chrome cookies 数据库

// 尝试用 sqlite3 读取 Chrome cookies
const CHROME_COOKIE_PATH = path.join(os.homedir(), 'Library/Application Support/Google/Chrome/Default/Cookies');
const CHROME_LOCAL_STATE = path.join(os.homedir(), 'Library/Application Support/Google/Chrome/Local State');

async function extractChromeCookies() {
  const tmpDb = '/tmp/chrome_cookies_tmp';
  try {
    // Copy cookies file to avoid lock
    fs.copyFileSync(CHROME_COOKIE_PATH, tmpDb);

    // Get encryption key from Local State
    const localState = JSON.parse(fs.readFileSync(CHROME_LOCAL_STATE, 'utf8'));
    const encryptedKey = Buffer.from(localState.os_crypt.encrypted_key, 'base64');
    // Strip DPAPI prefix (first 5 bytes)
    const key = encryptedKey.slice(5);

    // Use sqlite3 to query cookies
    const sql = `SELECT name, encrypted_value, host_key, path, expires_utc, is_secure, is_httponly FROM cookies WHERE host_key LIKE '%xiaohongshu%'`;
    const result = execSync(`sqlite3 "${tmpDb}" -json "${sql}"`, { encoding: 'utf8' });

    if (!result.trim()) {
      console.log('没有找到小红书 cookies，可能没有在 Chrome 中登录');
      return null;
    }

    const rows = JSON.parse(result);
    console.log(`找到 ${rows.length} 个小红书 cookies`);

    // Convert to Playwright storageState format
    const cookies = [];
    for (const row of rows) {
      cookies.push({
        name: row.name,
        value: '', // Chromium cookies are encrypted, we need Playwright to read them
        domain: row.host_key,
        path: row.path,
        expires: row.expires_utc ? Math.floor(row.expires_utc / 1000000) - 11644473600 : -1,
        secure: !!row.is_secure,
        httpOnly: !!row.is_httponly,
      });
    }

    return cookies;
  } catch (e) {
    console.log('读取 Chrome cookies 失败:', e.message);
    return null;
  } finally {
    try { fs.unlinkSync(tmpDb); } catch {}
  }
}

async function loginWithPersistent() {
  console.log('=== 小红书登录 ===');
  console.log('启动浏览器（使用持久化用户数据目录）...');

  const userDataDir = path.join(XHS_MCP_DATA_DIR, 'browser-data');
  fs.mkdirSync(userDataDir, { recursive: true });

  // Launch with persistent context so cookies persist
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    viewport: { width: 1280, height: 900 },
    args: ['--disable-blink-features=AutomationControlled'],
  });

  const page = context.pages()[0] || await context.newPage();
  await page.goto('https://www.xiaohongshu.com', { waitUntil: 'domcontentloaded', timeout: 60000 });

  // Check if already logged in
  await page.waitForTimeout(3000);
  const url = page.url();
  const title = await page.title();
  console.log(`当前页面: ${title}`);

  // Wait for login - check every 5s
  console.log('如果需要登录请扫码。已登录的话会自动检测...');
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 5000));
    const loggedIn = await page.evaluate(() => {
      // Check if we can see user-specific elements
      const el = document.querySelector('.user-info, .side-bar-user-info, [class*="avatar"], .login-container');
      const bodyText = document.body.innerText;
      // If there's a "登录" button prominently displayed, user is not logged in
      const hasLoginBtn = document.querySelector('a[href*="login"], button[class*="login"]');
      if (hasLoginBtn) return false;
      // Check for cookies that indicate login
      return document.cookie.includes('web_session') || document.cookie.includes('galaxy_creator_session_id');
    }).catch(() => false);

    if (loggedIn) {
      console.log('检测到已登录！');
      break;
    }
    process.stdout.write('.');
  }

  // Save storage state
  await context.storageState({ path: AUTH_PATH });
  console.log(`\n登录状态已保存到 ${AUTH_PATH}`);

  await context.close();
  process.exit(0);
}

loginWithPersistent().catch(e => {
  console.error('错误:', e.message);
  process.exit(1);
});
