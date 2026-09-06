// Quill Blog — 腾讯云 COS 上传模块
// 读取项目根 cos.config.json（已被 .gitignore 忽略），
// 将每篇文章的本地资源（assets/ 等非 md 文件）上传到 COS，
// 返回「相对路径 → COS URL」的映射，供 build.js 替换正文图片引用。
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import COS from 'cos-nodejs-sdk-v5';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CONFIG_PATH = path.join(ROOT, 'cos.config.json');

/** 读取配置；文件缺失或未启用时返回 null */
export async function loadCosConfig() {
  let raw;
  try {
    raw = await fs.readFile(CONFIG_PATH, 'utf-8');
  } catch {
    return null;
  }
  const cfg = JSON.parse(raw);
  if (!cfg.enabled) return null;
  if (!cfg.secretId || !cfg.secretKey) {
    console.warn('  [COS] enabled 但未配置 secretId/secretKey，跳过上传');
    return null;
  }
  return {
    secretId: cfg.secretId,
    secretKey: cfg.secretKey,
    bucket: cfg.bucket || '',
    region: cfg.region || '',
    prefix: (cfg.prefix || '').replace(/^\/+|\/+$/g, ''),
    skipExisting: cfg.skipExisting !== false,
  };
}

export function createCosClient(config) {
  return new COS({
    SecretId: config.secretId,
    SecretKey: config.secretKey,
  });
}

/** 把正文 HTML 里形如 ./assets/xxx 或 assets/xxx 的相对引用替换为 COS URL。
 *  map 键为相对文章目录的路径（如 assets/xxx.png）。
 *  markdown-it 会对含中文/空格的文件名做百分号转义（assets/%E5%97%9C...jpg），
 *  因此先按原文匹配，失败时解码后再查一次映射。
 */
export function rewriteRelativeImgs(html, map) {
  return html.replace(
    /(src|href)="(?:\.\/)?(assets\/[^"]+)"/g,
    (match, attr, rel) => {
      let url = map[rel];
      if (!url) {
        try {
          url = map[decodeURIComponent(rel)];
        } catch {
          /* 非法转义序列，跳过 */
        }
      }
      return url ? `${attr}="${url}"` : match;
    }
  );
}

/** SDK 回调 → Promise */
function cosCall(client, method, params) {
  return new Promise((resolve, reject) => {
    client[method](params, (err, data) => (err ? reject(err) : resolve(data)));
  });
}

/** 列出目录下所有非 .md 文件，返回相对 sourceDir 的 posix 路径数组 */
async function listAssetFiles(dir) {
  const out = [];
  const walk = async (cur) => {
    const entries = await fs.readdir(cur, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(cur, e.name);
      if (e.isDirectory()) {
        await walk(full);
      } else if (!e.name.toLowerCase().endsWith('.md')) {
        out.push(path.relative(dir, full).split(path.sep).join('/'));
      }
    }
  };
  await walk(dir);
  return out;
}

/** 生成 COS key：<prefix>/<slug>/<去掉了 assets/ 前缀的相对路径>
 *  本地 文章A/assets/xxx.png → 上传为 文章A/xxx.png
 */
function makeKey(config, slug, relPath) {
  const stripped = relPath.replace(/^assets\//, '');
  const parts = [config.prefix, slug, stripped].filter(Boolean);
  return parts.join('/');
}

function makeUrl(config, key) {
  const encoded = key.split('/').map(encodeURIComponent).join('/');
  return `https://${config.bucket}.cos.${config.region}.myqcloud.com/${encoded}`;
}

/** 上传一篇文章的本地资源，返回 { 相对路径: COS URL }；上传失败时不阻塞构建 */
export async function uploadPostAssets(config, client, post) {
  const map = {};
  let files = [];
  try {
    files = await listAssetFiles(post.sourceDir);
  } catch {
    return map;
  }

  for (const rel of files) {
    const key = makeKey(config, post.slug, rel);
    const url = makeUrl(config, key);
    try {
      if (config.skipExisting) {
        // 已存在则跳过（重复构建加速）
        try {
          await cosCall(client, 'headObject', {
            Bucket: config.bucket,
            Region: config.region,
            Key: key,
          });
          map[rel] = url;
          continue;
        } catch {
          /* 不存在，继续上传 */
        }
      }
      const body = await fs.readFile(path.join(post.sourceDir, rel.split('/').join(path.sep)));
      await cosCall(client, 'putObject', {
        Bucket: config.bucket,
        Region: config.region,
        Key: key,
        Body: body,
      });
      map[rel] = url;
      console.log(`  [COS↑] ${key}`);
    } catch (err) {
      console.warn(`  [COS!] ${key} 上传失败: ${err.message}`);
    }
  }
  return map;
}

/** 上传本地文件到 COS 指定 key，返回公开 URL。
 *  force=true 时总是覆盖上传（用于每次重新生成的截图）；
 *  否则按 config.skipExisting 决定是否跳过已存在对象。
 */
export async function uploadFile(config, client, key, filePath, force = false) {
  if (!force && config.skipExisting) {
    try {
      await cosCall(client, 'headObject', {
        Bucket: config.bucket,
        Region: config.region,
        Key: key,
      });
      return makeUrl(config, key); // 已存在，跳过
    } catch {
      /* 不存在，继续上传 */
    }
  }
  const body = await fs.readFile(filePath);
  await cosCall(client, 'putObject', {
    Bucket: config.bucket,
    Region: config.region,
    Key: key,
    Body: body,
  });
  return makeUrl(config, key);
}