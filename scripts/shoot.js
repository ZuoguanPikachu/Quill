// Quill Blog — 自动生成 siteshot（视口截图，效果等同于 DevTools 的「Capture screenshot」）
// 流程：本地起 serve.js → 无头浏览器按视口打开首页 → 截取当前可见区域
//       → public/images/siteshot.png，并转一份 siteshot.jpg；
//       若 COS 已启用，PNG/JPG 各上传一份到图床 assets/siteshot.{png,jpg}（覆盖）
// 用法：
//   npm run shot                                    （单独执行）
//   或由 build.js 构建结束后自动调用 generateShot()
// 可选：环境变量 SHOT_BROWSER=浏览器exe路径（默认自动探测 Edge / Chrome）
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import sharp from 'sharp';
import { loadCosConfig, createCosClient, uploadFile } from './cos.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT_FILE = path.join(ROOT, 'public', 'images', 'siteshot.png'); // PNG 输出位置
const JPG_FILE = path.join(ROOT, 'public', 'images', 'siteshot.jpg'); // JPG 输出位置
const COS_OBJECT = 'assets/siteshot.png';                              // 图床 PNG key
const COS_JPG = 'assets/siteshot.jpg';                                 // 图床 JPG key
const PROFILE_DIR = path.join(ROOT, '.shot-profile');
// 模拟一个常见桌面窗口视口；像素输出 = 视口尺寸 × DEVICE_SCALE（类似 DevTools 按设备像素比）
const VIEW_W = 1920;
const VIEW_H = 919;
const DEVICE_SCALE = 1;

const BROWSER_CANDIDATES = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
];

async function findBrowser() {
  const exists = async (p) => {
    try {
      return (await fs.stat(p)).isFile();
    } catch {
      return false;
    }
  };
  const fromEnv = process.env.SHOT_BROWSER;
  if (fromEnv && (await exists(fromEnv))) return fromEnv;
  for (const p of BROWSER_CANDIDATES) {
    if (await exists(p)) return p;
  }
  return null;
}

/** 轮询等待本地服务器可访问 */
function waitForServer(url, timeout = 15000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = async () => {
      if (Date.now() - start > timeout) return reject(new Error(`服务器启动超时: ${url}`));
      try {
        const res = await fetch(url);
        if (res.ok) return resolve();
      } catch {
        /* 未就绪，继续等 */
      }
      setTimeout(tick, 200);
    };
    tick();
  });
}

/** 生成视口截图（siteshot）并（可选）上传 COS；任何失败都不抛致命错误，返回结果对象 */
export async function generateShot() {
  const browserPath = await findBrowser();
  if (!browserPath) {
    console.warn('  [shot] 未找到 Edge/Chrome，跳过截图（可用 $env:SHOT_BROWSER 指定）');
    return { ok: false, reason: 'no-browser' };
  }

  const port = 20000 + Math.floor(Math.random() * 20000);
  const server = spawn(process.execPath, [path.join(__dirname, 'serve.js')], {
    env: { ...process.env, PORT: String(port) },
    stdio: 'ignore',
  });
  const url = `http://127.0.0.1:${port}/`;
  let browser = null;

  try {
    await waitForServer(url);
    console.log(`  [shot] 无头浏览器: ${browserPath}`);

    browser = await puppeteer.launch({
      executablePath: browserPath,
      headless: true,
      args: [
        '--disable-gpu',
        '--no-first-run',
        '--disable-extensions',
        `--user-data-dir=${PROFILE_DIR}`,
      ],
    });
    const page = await browser.newPage();
    await page.setViewport({ width: VIEW_W, height: VIEW_H, deviceScaleFactor: DEVICE_SCALE });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.evaluate(() => {
      document.querySelectorAll('img[loading="lazy"]').forEach((img) => {
        img.loading = 'eager';
      });
    });
    await new Promise((r) => setTimeout(r, 2000)); // 等样式与首屏图片渲染
    await fs.mkdir(path.dirname(OUT_FILE), { recursive: true });
    // 只截当前可见视口（不加 clip / fullPage），等同 DevTools 的 Capture screenshot
    await page.screenshot({ path: OUT_FILE });
    console.log(`  [shot] siteshot.png 已生成: ${OUT_FILE} (${VIEW_W}x${VIEW_H} 视口，${DEVICE_SCALE}x)`);

    // 转一份 JPG（白底合并、质量 95）；转换失败不影响 PNG 与上传
    try {
      await sharp(OUT_FILE)
        .flatten({ background: '#fff' })
        .jpeg({ quality: 95, mozjpeg: true })
        .toFile(JPG_FILE);
      console.log(`  [shot] siteshot.jpg 已生成: ${JPG_FILE}`);
    } catch (err) {
      console.warn(`  [shot] JPG 转换失败（跳过）: ${err.message}`);
    }

    // 上传 PNG + JPG 到图床（force 覆盖，保证最新）
    const cosConfig = await loadCosConfig();
    if (cosConfig) {
      const client = createCosClient(cosConfig);
      for (const [local, key] of [
        [OUT_FILE, COS_OBJECT],
        [JPG_FILE, COS_JPG],
      ]) {
        try {
          const cosUrl = await uploadFile(cosConfig, client, key, local, true);
          console.log(`  [shot] 已上传图床: ${cosUrl}`);
        } catch (err) {
          console.warn(`  [shot] 上传 ${key} 失败: ${err.message}`);
        }
      }
    } else {
      console.log('  [shot] COS 未启用，跳过上传');
    }
    return { ok: true, file: OUT_FILE, jpg: JPG_FILE };
  } catch (err) {
    console.warn(`  [shot] 截图失败: ${err.message}`);
    return { ok: false, reason: err.message };
  } finally {
    if (browser) await browser.close().catch(() => {});
    server.kill();
    await fs.rm(PROFILE_DIR, { recursive: true, force: true }).catch(() => {});
  }
}

// 直接运行（npm run shot）时执行；被 build.js import 时只导出函数
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  generateShot()
    .then((r) => {
      if (!r.ok) process.exitCode = 1;
    })
    .catch((err) => {
      console.error('[错误]', err.message);
      process.exitCode = 1;
    });
}