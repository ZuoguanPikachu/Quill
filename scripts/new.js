// Quill Blog — 创建新文章（类似 hexo new）
// 用法：
//   npm run new -- "文章标题"    或  不带参数交互式输入标题
// 效果：在 source/posts/<标题>/ 下创建 post.md，写入 front matter。
//   tags / categories 保留为空字段，由用户自行填写；
//   index_img 留空，build 时自动分配最小的空闲编号并回写。
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const POSTS_DIR = path.join(ROOT, 'source', 'posts');

// ---------- 参数解析 ----------

function parseArgs(argv) {
  const args = { title: '', help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') args.help = true;
    else if (args.title === '') args.title = a;
    else args.title += ' ' + a; // 未加引号时拼回带空格的标题
  }
  return args;
}

// ---------- 工具 ----------

/** 把标题改成合法的目录名（Windows 禁用字符替换为空格） */
function sanitizeName(name) {
  return String(name)
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+$/, '_')   // 纯点号目录名非法
    .slice(0, 80)
    || 'untitled';
}

/** 本地时间 "YYYY-MM-DD HH:mm:ss"（与现有文章 front matter 格式一致） */
function nowStamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

// ---------- 交互 ----------

async function ask(question, def = '') {
  const rl = createInterface({ input, output });
  try {
    const answer = await rl.question(question);
    return answer.trim() || def;
  } finally {
    rl.close();
  }
}

// ---------- 主流程 ----------

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    console.log(`创建新文章:
  npm run new -- "文章标题"
选项:
  -h, --help  帮助`);
    return;
  }

  let title = args.title;
  if (!title) {
    title = await ask('文章标题: ');
  }

  if (!title.trim()) {
    console.error('[错误] 未提供文章标题');
    process.exit(1);
  }

  const slug = sanitizeName(title);
  const dirPath = path.join(POSTS_DIR, slug);
  const mdPath = path.join(dirPath, 'post.md');

  // 检查是否已存在
  try {
    await fs.access(dirPath);
    console.error(`[错误] 已存在同名文章目录: ${dirPath}`);
    process.exit(1);
  } catch {
    /* 不存在，正常创建 */
  }

  // front matter：tags / categories 留空让用户自己填；index_img 不写，由 build 自动分配
  const content = `---
title: ${title}
date: ${nowStamp()}
tags: 
categories: 
---

`;
  await fs.mkdir(dirPath, { recursive: true });
  await fs.writeFile(mdPath, content, 'utf-8');

  console.log(`\n[创建完成] ${mdPath}\n`);
}

main().catch((err) => {
  console.error('[错误]', err);
  process.exit(1);
});