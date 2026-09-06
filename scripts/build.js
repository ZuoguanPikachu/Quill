// Quill Blog — 静态站点构建脚本
// 思路：
//   source/posts/<目录>/<任意 .md 文件>  →  一篇文章
//   md 文件以外的文件（assets/、图片等）原样复制到输出，保持相对路径
//   目录名即文章的 slug（URL 路径），front matter 提供元数据
//   额外生成：归档 / 分类 / 标签 / 友链 页面，导航栏常驻
// 本文件只负责「数据 + 编排」：
//   - 页面渲染在 scripts/templates/（layout / post / post-list / archives / terms / friends）
//   - 样式源文件在 scripts/style.css（构建时读入并输出到 public/style.css）
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';
import MarkdownIt from 'markdown-it';
import { load as yamlLoad } from 'js-yaml';
import {
  loadCosConfig,
  createCosClient,
  uploadPostAssets,
  rewriteRelativeImgs,
} from './cos.js';
import { PER_PAGE } from './templates/pager.js';
import { applySiteConfig, escapeHtml } from './templates/layout.js';
import { renderPostPage } from './templates/post.js';
import { renderIndex } from './templates/post-list.js';
import { renderArchives } from './templates/archives.js';
import {
  groupBy,
  renderCategoriesOverview,
  renderTagsOverview,
  renderTermPage,
} from './templates/terms.js';
import { renderFriends } from './templates/friends.js';
// CJS 包，取其导出对象上的 default（即插件函数本身）
// 只借用它的 $...$ / $$...$$ 分词规则，渲染引擎换成 MathJax（见下）
import katexPluginModule from '@vscode/markdown-it-katex';
const katexPlugin = katexPluginModule.default ?? katexPluginModule;
import Prism from 'prismjs';
// 官方 Node 加载器：按需注册语法（处理依赖），bash 等别名也会一并注册
const loadPrismLanguages = (await import('prismjs/components/index.js')).default;
loadPrismLanguages(['python', 'csharp', 'json', 'powershell', 'yaml', 'bash']);
// 博客里 ```c# 围栏是 C# 代码；```assembly 保持纯文本（Prism 无对应语法）
Prism.languages['c#'] = Prism.languages.csharp;
import { mathjax } from 'mathjax-full/js/mathjax.js';
import { TeX } from 'mathjax-full/js/input/tex.js';
import { SVG } from 'mathjax-full/js/output/svg.js';
import { liteAdaptor } from 'mathjax-full/js/adaptors/liteAdaptor.js';
import { RegisterHTMLHandler } from 'mathjax-full/js/handlers/html.js';
import { AllPackages } from 'mathjax-full/js/input/tex/AllPackages.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SOURCE = path.join(ROOT, 'source', 'posts');
const DATA_DIR = path.join(ROOT, 'source', '_data');
const OUTPUT = path.join(ROOT, 'public');
const STYLE_SRC = path.join(__dirname, 'style.css');
const MAIN_SRC = path.join(__dirname, 'main.js');

// ---------- MathJax（构建期渲染，输出内联 SVG，不依赖任何 CSS / 字体文件） ----------
const mjAdaptor = liteAdaptor();
RegisterHTMLHandler(mjAdaptor);
const mjDocument = mathjax.document('', {
  InputJax: new TeX({ packages: AllPackages }),
  OutputJax: new SVG({ fontCache: 'local' }),
});

/** 渲染一段 LaTeX 为 MathJax SVG HTML；解析失败时原样展示并带错误提示 */
function renderMath(latex, displayMode) {
  try {
    const node = mjDocument.convert(latex, { display: displayMode });
    return mjAdaptor.outerHTML(node);
  } catch (err) {
    const tip = String(err.message || err).replace(/"/g, '&quot;');
    return `<span class="math-error" title="${tip}">${escapeHtml(latex)}</span>`;
  }
}

const md = new MarkdownIt({
  html: true,          // 允许正文内嵌 HTML
  linkify: true,       // 自动识别链接
  typographer: false,
});

// LaTeX 数学公式：$...$ 行内、$$...$$ 独立行（分词用现成插件，渲染换 MathJax SVG）。
md.use(katexPlugin, { throwOnError: false });
md.renderer.rules.math_inline = (tokens, idx) => {
  // 兼容 $`1+1=2`$ 的写法：内容两端为反引号时去掉
  const content = tokens[idx].content;
  const hasBacktick =
    content.length > 2 && content[0] === '`' && content[content.length - 1] === '`';
  return renderMath(hasBacktick ? content.slice(1, -1) : content, false);
};
md.renderer.rules.math_inline_block = (tokens, idx) =>
  renderMath(tokens[idx].content, true);
md.renderer.rules.math_inline_bare_block = (tokens, idx) =>
  renderMath(tokens[idx].content, true);
md.renderer.rules.math_block = (tokens, idx) =>
  renderMath(tokens[idx].content, true);

// 文章内的链接一律新窗口打开（带安全 rel）
md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  tokens[idx].attrSet('target', '_blank');
  tokens[idx].attrSet('rel', 'noopener noreferrer');
  return self.renderToken(tokens, idx, options);
};

/** 代码块渲染：PrismJS 语法高亮（atom-dark 主题）+ macOS 风格标题栏（红黄绿圆点）+ 语言标签 + 行号 + 复制按钮。
 *  行号用 CSS 计数器生成（不会混入可复制的文本）；复制按钮由 /main.js 接管。
 */
function highlightWithPrism(code, lang) {
  if (!lang) return escapeHtml(code);
  const grammar =
    Prism.languages[lang] ||
    (Prism.aliases ? Prism.languages[Prism.aliases[lang]] : undefined);
  if (!grammar) return escapeHtml(code);
  try {
    return Prism.highlight(code, grammar, lang);
  } catch {
    return escapeHtml(code);
  }
}

md.renderer.rules.fence = (tokens, idx) => {
  const token = tokens[idx];
  const info = (token.info || '').trim();
  const lang = info.split(/\s+/)[0] || '';
  const code = token.content.replace(/\n$/, '');

  // 语言为 math 的围栏代码块按数学公式渲染（对齐原插件的 ```math 支持）
  if (lang.toLowerCase() === 'math') {
    return renderMath(code, true) + '\n';
  }

  const body = highlightWithPrism(code, lang);
  const langLabel = escapeHtml(lang || 'text');
  const cls = `language-${escapeHtml(lang || 'plaintext')}`;
  // 行号放在独立的 gutter 列（不随 .code-scroll 水平滚动），复制时也不会带入。
  // 行内容之间不拼接换行符——<pre> 会把换行符渲染成空白行，每行已是 display:block。
  const sourceLines = body.split('\n');
  const codeHtml = sourceLines
    .map((line) => `<span class="line">${line || ' '}</span>`)
    .join('');
  const gutterHtml = sourceLines
    .map((_, i) => `<span class="line-no">${i + 1}</span>`)
    .join('');
  return `<figure class="code-block" data-lang="${escapeHtml(lang)}">
  <figcaption class="code-header">
    <span class="code-dots"><i class="code-dot red"></i><i class="code-dot yellow"></i><i class="code-dot green"></i></span>
    <span class="code-lang">${langLabel}</span>
    <button type="button" class="code-copy" data-code-copy>复制</button>
  </figcaption>
  <div class="code-body">
    <div class="code-gutter" aria-hidden="true">${gutterHtml}</div>
    <pre class="code-scroll"><code class="${cls}">${codeHtml}</code></pre>
  </div>
</figure>`;
};

/** 移除 HTML 标签，得到纯文本，用于生成摘要 */
function plainText(html) {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 生成摘要：先剔除代码块的装饰部分（语言标签 / 复制按钮 / 行号列），
 *  避免这些界面元素混入卡片摘要（保留代码内容本身）。 */
function makeExcerpt(content) {
  const html = md
    .render(content)
    .replace(/<figcaption class="code-header">[\s\S]*?<\/figcaption>/g, '')
    .replace(/<div class="code-gutter"[^>]*>[\s\S]*?<\/div>/g, '');
  return plainText(html).slice(0, 160);
}

/** tags / categories 字段可能是字符串或数组，统一成数组 */
function toArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

/** 从 front matter 的 date 字段得到 { text: "YYYY-MM-DD", ts: 时间戳 }
 *  YAML 可能把 "2022-09-18 21:58:12" 解析成 UTC Date，直接取 UTC 年月日还原，
 *  避免本地时区导致日期偏移一天。
 */
function normalizeDate(value) {
  if (value instanceof Date && !isNaN(value)) {
    const s = value.toISOString();
    return { text: s.slice(0, 10), ts: value.getTime() };
  }
  const s = String(value ?? '');
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    return {
      text: `${m[1]}-${m[2]}-${m[3]}`,
      ts: Date.UTC(+m[1], +m[2] - 1, +m[3]),
    };
  }
  const d = new Date(s);
  return isNaN(d)
    ? { text: '', ts: 0 }
    : { text: formatDate(d), ts: d.getTime() };
}

function formatDate(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 按目录扫描一篇文章：优先取 post.md，找不到则取第一个 .md（兼容旧命名） */
async function scanPost(dirPath, dirName) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const mdEntry =
    entries.find((e) => e.isFile() && e.name.toLowerCase() === 'post.md') ||
    entries.find((e) => e.isFile() && e.name.toLowerCase().endsWith('.md'));
  if (!mdEntry) return null;

  const mdPath = path.join(dirPath, mdEntry.name);
  const raw = await fs.readFile(mdPath, 'utf-8');
  const { data, content } = matter(raw);

  const dateInfo = normalizeDate(data.date);
  const title = data.title || mdEntry.name.replace(/\.md$/i, '');

  return {
    slug: dirName,                 // 目录名即 slug
    title,
    date: dateInfo.ts,
    dateText: dateInfo.text,       // YYYY-MM-DD
    tags: toArray(data.tags),
    categories: toArray(data.categories),
    indexImg: data.index_img || data.banner_img || '',
    math: Boolean(data.math),
    // 正文相对 md 文件所在目录，输出时保持相同相对结构
    body: md.render(content),
    excerpt: makeExcerpt(content),
    sourceDir: dirPath,
    mdFileName: mdEntry.name,
  };
}

/** 复制非 .md 文件到输出（保留 assets 等相对结构），返回实际复制的文件数（递归统计）。
 *  skip：已成功上传到 COS 的相对路径集合（posix 形式，如 assets/xxx.png）。
 *  启用 COS 时这些文件不再复制到产物；未上传成功的不在集合内，仍复制作为本地回退。
 *  目录只在确有文件要写入时才创建，避免留下空的 assets/ 目录。
 */
async function copyAssets(post, outDir, skip = null) {
  const files = [];
  const walk = async (srcDir) => {
    const entries = await fs.readdir(srcDir, { withFileTypes: true });
    for (const e of entries) {
      if (e.isFile() && e.name.toLowerCase().endsWith('.md')) continue;
      const src = path.join(srcDir, e.name);
      if (e.isDirectory()) {
        await walk(src);
      } else {
        const rel = path.relative(post.sourceDir, src).split(path.sep).join('/');
        if (skip && skip.has(rel)) continue;
        files.push({ src, rel });
      }
    }
  };
  await walk(post.sourceDir);
  for (const { src, rel } of files) {
    const dest = path.join(outDir, ...rel.split('/'));
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.copyFile(src, dest);
  }
  return files.length;
}

/** 读取 source/_data/friends.yml，返回友链数组 */
async function loadFriends() {
  try {
    const raw = await fs.readFile(path.join(DATA_DIR, 'friends.yml'), 'utf-8');
    const list = yamlLoad(raw);
    if (!Array.isArray(list)) return [];
    return list.filter((f) => f && f.name && f.url);
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

/** 读取 source/_data/site.yml（缺失时返回 {}，由模板回退到默认值） */
async function loadSiteConfig() {
  try {
    const raw = await fs.readFile(path.join(DATA_DIR, 'site.yml'), 'utf-8');
    const cfg = yamlLoad(raw);
    return cfg && typeof cfg === 'object' ? cfg : {};
  } catch (err) {
    if (err.code === 'ENOENT') return {};
    throw err;
  }
}

/** 从 URL 中提取图库编号（.../assets/16.jpg → 16），无则返回 null */
function extractImgIndex(url) {
  const m = String(url ?? '').match(/\/assets\/(\d+)\.jpg/);
  return m ? Number(m[1]) : null;
}

/** 为缺少 index_img 的文章分配最小空闲编号并回写源文件。
 *  图库 URL 形如 .../assets/{{i}}.jpg，编号需全局唯一；
 *  build 时统一分配，删除文章后编号自动复用，永不冲突、不跳号。
 */
async function assignIndexImgs(posts) {
  const used = new Set();
  for (const p of posts) {
    const idx = extractImgIndex(p.indexImg);
    if (idx != null) used.add(idx);
  }

  const missing = posts
    .filter((p) => !p.indexImg.trim())
    .sort((a, b) => a.date - b.date); // 旧的先分配小号

  let next = 0;
  const nextFree = () => {
    while (used.has(next)) next++;
    used.add(next);
    return next;
  };

  for (const p of missing) {
    const idx = nextFree();
    const url = `https://zuoguan-piclib-1257172707.cos.ap-guangzhou.myqcloud.com/assets/${idx}.jpg`;
    const mdPath = path.join(p.sourceDir, p.mdFileName);
    await writeIndexImg(mdPath, url);
    p.indexImg = url;       // 内存中同步，本次构建即可用
    console.log(`  [index_img] ${p.slug} → assets/${idx}.jpg`);
  }
}

/** 在 front matter 中写入/填充 index_img 字段（保留其余内容原样） */
async function writeIndexImg(mdPath, url) {
  const raw = await fs.readFile(mdPath, 'utf-8');
  // 整个 front matter 块
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return;
  const fm = m[1];
  let newFm;
  if (/^index_img\s*:[^\S\r\n]*$/m.test(fm)) {
    // 已有空 index_img 行 → 填充
    newFm = fm.replace(/^index_img\s*:[^\S\r\n]*$/m, `index_img: ${url}`);
  } else if (/^index_img\s*:/m.test(fm)) {
    return; // 已有值，不动
  } else {
    // 无该字段 → 插在 date: 行后
    newFm = fm.replace(
      /^(date:.*)$/m,
      (d) => `${d}\nindex_img: ${url}`
    );
  }
  await fs.writeFile(mdPath, raw.replace(m[0], `---\n${newFm}\n---`), 'utf-8');
}

// ---------- 主流程 ----------

async function build() {
  // 清理输出目录，但保留 images/（siteshot 等手动/自动图片）不做清理
  console.log('[*] 清理输出目录（保留 images/）:', OUTPUT);
  const oldEntries = await fs.readdir(OUTPUT, { withFileTypes: true }).catch(() => []);
  for (const e of oldEntries) {
    if (e.name === 'images') continue;
    await fs.rm(path.join(OUTPUT, e.name), { recursive: true, force: true });
  }
  await fs.mkdir(path.join(OUTPUT, 'posts'), { recursive: true });

  // 站点配置（source/_data/site.yml）：标题 / 副标题，缺省时使用模板默认值
  applySiteConfig(await loadSiteConfig());

  // COS 上传配置（未启用/未配置时 cosClient 为 null，走本地构建）
  const cosConfig = await loadCosConfig();
  const cosClient = cosConfig ? createCosClient(cosConfig) : null;
  if (cosClient) {
    console.log(`[*] COS 上传已启用: ${cosConfig.bucket} (region: ${cosConfig.region})`);
  } else {
    console.log('[*] COS 上传未启用，图片使用本地路径');
  }

  const dirs = (await fs.readdir(SOURCE, { withFileTypes: true })).filter(
    (e) => e.isDirectory()
  );

  const posts = [];
  for (const dir of dirs) {
    const dirPath = path.join(SOURCE, dir.name);
    const post = await scanPost(dirPath, dir.name);
    if (!post) {
      console.warn('  [跳过] 目录内没有 .md 文件:', dir.name);
      continue;
    }
    posts.push(post);
  }

  posts.sort((a, b) => b.date - a.date);

  // 先为缺失 index_img 的文章分配空闲编号（会回写源文件）。
  await assignIndexImgs(posts);

  for (const post of posts) {
    const outDir = path.join(OUTPUT, 'posts', post.slug);
    await fs.mkdir(outDir, { recursive: true });

    // 先上传该文章本地资源到 COS，得到 相对路径 → URL 映射
    const imgMap = cosClient
      ? await uploadPostAssets(cosConfig, cosClient, post)
      : null;

    // 已成功上传到 COS 的资源不再复制到产物（启用 COS 时产物不含 assets/）；
    // 上传失败的仍复制到本地，保证图片可回退到本地路径。
    const assets = await copyAssets(
      post,
      outDir,
      imgMap ? new Set(Object.keys(imgMap)) : null
    );

    let pageHtml = renderPostPage(post);
    if (imgMap && Object.keys(imgMap).length) {
      pageHtml = rewriteRelativeImgs(pageHtml, imgMap);
    }
    await fs.writeFile(
      path.join(outDir, 'index.html'),
      pageHtml,
      'utf-8'
    );
    console.log(
      `  [OK] ${post.slug}  (${post.dateText}, ${assets} 个资源文件)`
    );
  }

  // 首页（分页：/ 、/page/2/ …）
  const indexPages = Math.max(1, Math.ceil(posts.length / PER_PAGE));
  for (let page = 1; page <= indexPages; page++) {
    const pageDir = page === 1 ? OUTPUT : path.join(OUTPUT, 'page', String(page));
    await fs.mkdir(pageDir, { recursive: true });
    await fs.writeFile(
      path.join(pageDir, 'index.html'),
      renderIndex(posts, page),
      'utf-8'
    );
  }
  console.log(`  [OK] / 首页（${indexPages} 页，每页 ${PER_PAGE} 篇）`);

  // 归档
  const archivesDir = path.join(OUTPUT, 'archives');
  await fs.mkdir(archivesDir, { recursive: true });
  await fs.writeFile(
    path.join(archivesDir, 'index.html'),
    renderArchives(posts),
    'utf-8'
  );
  console.log(`  [OK] archives/ (${posts.length} 篇)`);

  // 分类
  const categoryGroups = groupBy(posts, 'categories');
  const categoriesDir = path.join(OUTPUT, 'categories');
  await fs.mkdir(categoriesDir, { recursive: true });
  await fs.writeFile(
    path.join(categoriesDir, 'index.html'),
    renderCategoriesOverview(categoryGroups),
    'utf-8'
  );
  for (const g of categoryGroups) {
    const dir = path.join(categoriesDir, g.name);
    const termPages = Math.max(1, Math.ceil(g.posts.length / PER_PAGE));
    for (let page = 1; page <= termPages; page++) {
      const pageDir = page === 1 ? dir : path.join(dir, 'page', String(page));
      await fs.mkdir(pageDir, { recursive: true });
      await fs.writeFile(
        path.join(pageDir, 'index.html'),
        renderTermPage('categories', g.name, g.posts, page),
        'utf-8'
      );
    }
  }
  console.log(`  [OK] categories/ (${categoryGroups.length} 个分类)`);

  // 标签
  const tagGroups = groupBy(posts, 'tags');
  const tagsDir = path.join(OUTPUT, 'tags');
  await fs.mkdir(tagsDir, { recursive: true });
  await fs.writeFile(
    path.join(tagsDir, 'index.html'),
    renderTagsOverview(tagGroups),
    'utf-8'
  );
  for (const g of tagGroups) {
    const dir = path.join(tagsDir, g.name);
    const termPages = Math.max(1, Math.ceil(g.posts.length / PER_PAGE));
    for (let page = 1; page <= termPages; page++) {
      const pageDir = page === 1 ? dir : path.join(dir, 'page', String(page));
      await fs.mkdir(pageDir, { recursive: true });
      await fs.writeFile(
        path.join(pageDir, 'index.html'),
        renderTermPage('tags', g.name, g.posts, page),
        'utf-8'
      );
    }
  }
  console.log(`  [OK] tags/ (${tagGroups.length} 个标签)`);

  // 友链
  const friends = await loadFriends();
  const friendsDir = path.join(OUTPUT, 'friends');
  await fs.mkdir(friendsDir, { recursive: true });
  await fs.writeFile(
    path.join(friendsDir, 'index.html'),
    renderFriends(friends),
    'utf-8'
  );
  console.log(`  [OK] friends/ (${friends.length} 个友链)`);

  // 样式（源文件 scripts/style.css）
  const style = await fs.readFile(STYLE_SRC, 'utf-8');
  await fs.writeFile(path.join(OUTPUT, 'style.css'), style, 'utf-8');

  // 全站脚本（源文件 scripts/main.js：复制按钮等）
  const mainJs = await fs.readFile(MAIN_SRC, 'utf-8');
  await fs.writeFile(path.join(OUTPUT, 'main.js'), mainJs, 'utf-8');

  // PrismJS 主题（Atom One Light），供语法高亮的代码块使用
  const prismCssSrc = path.join(
    ROOT,
    'node_modules',
    'prism-themes',
    'themes',
    'prism-one-light.css'
  );
  try {
    const prismCss = await fs.readFile(prismCssSrc, 'utf-8');
    await fs.writeFile(path.join(OUTPUT, 'prism.css'), prismCss, 'utf-8');
  } catch (err) {
    console.warn(`  [警告] 复制 Prism 主题失败: ${err.message}`);
  }

  console.log(`\n[完成] 共构建 ${posts.length} 篇文章 → ${OUTPUT}`);

  // 构建结束后自动生成 siteshot（视口截图，等同 DevTools Capture screenshot → public/images/siteshot.png，并上传 COS）。
  // 截图失败不影响构建结果，只打印警告。
  try {
    const { generateShot } = await import('./shoot.js');
    await generateShot();
  } catch (err) {
    console.warn(`  [警告] og:image 生成失败（不影响构建）: ${err.message}`);
  }
}

build().catch((err) => {
  console.error('[错误]', err);
  process.exit(1);
});