// Quill Blog — 极简静态文件服务器（仅用于本地预览构建产物）
// 可选依赖 qrcode-terminal（缺失时自动跳过二维码，不影响启动）
import { createServer } from 'node:http';
import os from 'node:os';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');
const PORT = process.env.PORT || 8080;
// 默认局域网预览：绑定 0.0.0.0，启动即打印局域网地址 + 二维码（手机扫码直开）。
// 只想本机看时用 --local 或 $env:HOST='127.0.0.1'（动态指定 HOST 优先）。
const HOST = process.env.HOST || (process.argv.includes('--local') ? '127.0.0.1' : '0.0.0.0');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
};

function mimeOf(filePath) {
  return MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    let pathname = decodeURIComponent(url.pathname);
    if (pathname.endsWith('/')) pathname += 'index.html';
    let filePath = path.normalize(path.join(PUBLIC, pathname));

    // 防目录穿越
    if (!filePath.startsWith(PUBLIC)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    if (await exists(filePath)) {
      const data = await fs.readFile(filePath);
      res.writeHead(200, { 'Content-Type': mimeOf(filePath) });
      res.end(data);
      return;
    }

    // 找不到 → 回退首页（SPA 式），或 403 裸目录
    if (await exists(path.join(filePath, 'index.html'))) {
      const data = await fs.readFile(path.join(filePath, 'index.html'));
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(data);
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 Not Found');
  } catch (err) {
    console.error(err);
    res.writeHead(500);
    res.end('Internal Server Error');
  }
});

/** 获取本机非回环 IPv4 局域网地址（私网段优先：10/8、172.16/12、192.168/16） */
function getLanAddresses() {
  const isPrivate = (ip) =>
    /^(10\.|192\.168\.)/.test(ip) || /^172\.(1[6-9]|2\d|3[01])\./.test(ip);
  // 跳过代理/虚拟网卡的保留段（169.254 链路本地、198.18/15 基准测试段等）
  const isJunk = (ip) =>
    /^169\.254\./.test(ip) || /^198\.1[89]\./.test(ip) || /^224\./.test(ip);
  const list = [];
  for (const infos of Object.values(os.networkInterfaces())) {
    for (const info of infos || []) {
      if (info.family === 'IPv4' && !info.internal && !isJunk(info.address)) {
        list.push({ address: info.address, private: isPrivate(info.address) });
      }
    }
  }
  list.sort((a, b) => Number(b.private) - Number(a.private));
  return [...new Set(list.map((x) => x.address))];
}

/** 在终端打印二维码（可选依赖，缺失则静默跳过） */
async function printQr(url) {
  try {
    const mod = await import('qrcode-terminal');
    const api = mod.default ?? mod; // module.exports（需作为方法调用，绑定 this）
    api.generate(url, { small: true }, (code) => console.log(code));
  } catch {
    /* 未安装 qrcode-terminal：跳过二维码 */
  }
}

/** 端口被占用时自动顺延，最多尝试 20 次 */
function listen(port, attempt) {
  server.once('error', (err) => {
    if (err.code === 'EADDRINUSE' && attempt < 20) {
      console.warn(`  [警告] 端口 ${port} 被占用，改用 ${port + 1}`);
      listen(port + 1, attempt + 1);
    } else {
      console.error('[错误]', err.message);
      process.exit(1);
    }
  });
  server.listen(port, HOST, async () => {
    console.log(`\n  Quill 博客预览服务器已启动`);
    console.log(`  本机:   http://127.0.0.1:${port}/`);
    const lanMode = HOST !== '127.0.0.1' && HOST !== 'localhost';
    const lanAddresses = getLanAddresses();
    if (lanMode && lanAddresses.length) {
      for (const ip of lanAddresses) {
        console.log(`  局域网: http://${ip}:${port}/`);
      }
      const url = `http://${lanAddresses[0]}:${port}/`;
      console.log(`  手机需与电脑在同一 Wi-Fi，扫下方二维码即可预览：`);
      await printQr(url);
    } else {
      console.log(`  提示: 仅本机模式；局域网预览请改用 npm run serve`);
    }
    console.log(`  按 Ctrl+C 停止\n`);
  });
}

listen(PORT, 0);