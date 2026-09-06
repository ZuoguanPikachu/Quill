// Quill Blog — 页面骨架模板
// 站点信息（SITE）、导航（NAV）、HTML 外壳（layout）与 HTML 转义（escapeHtml）。
// 各页面渲染函数都复用这里的 layout()。

// 站点信息默认值：build.js 会读取 source/_data/site.yml 并调用
// applySiteConfig() 覆盖这里的内容；配置文件缺失时使用这些默认值。
export const SITE = {
  title: 'Quill',
  subtitle: '一个用 Markdown 写的极简博客',
  favicon: '', // 站点图标（site.yml → favicon，留空则不输出）
  banner: '', // 首页 Hero Banner 背景图（site.yml → banner，留空则不输出）
};

/** 用 site.yml 的内容覆盖 SITE（标题 / 副标题 / 图标 / banner） */
export function applySiteConfig(cfg = {}) {
  if (cfg && typeof cfg === 'object') {
    if (typeof cfg.title === 'string' && cfg.title.trim()) {
      SITE.title = cfg.title.trim();
    }
    if (typeof cfg.subtitle === 'string') {
      SITE.subtitle = cfg.subtitle.trim(); // 填写了字符串（可留空）→ 按内容显示
    } else {
      SITE.subtitle = ''; // 未填写（null / 缺省）→ 不显示
    }
    if (typeof cfg.favicon === 'string') {
      SITE.favicon = cfg.favicon.trim(); // 留空 → 不输出 <link rel="icon">
    } else {
      SITE.favicon = '';
    }
    if (typeof cfg.banner === 'string') {
      SITE.banner = cfg.banner.trim(); // 留空 → 首页不显示 Hero Banner
    } else {
      SITE.banner = '';
    }
  }
  return SITE;
}

const NAV = [
  { label: '首页', href: '/', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>' },
  { label: '归档', href: '/archives/', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>' },
  { label: '分类', href: '/categories/', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>' },
  { label: '标签', href: '/tags/', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>' },
  { label: '友链', href: '/friends/', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>' },
];

export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Hero Banner（全站页面通用）：导航栏下方全宽大图横幅。
 *  hero 为布尔或对象 { background, title, subtitle }：
 *    - background 缺省回退到站点 banner 配置，为空则不渲染
 *    - title / subtitle 缺省回退到站点标题 / 副标题
 *  subtitle 传 null 或空字符串时隐藏副标题行
 */
export function heroHtml(hero = {}) {
  const background = hero.background || SITE.banner;
  if (!background) return '';
  const title = hero.title || SITE.title;
  const subtitle = hero.subtitle != null ? hero.subtitle : SITE.subtitle;
  const subHtml = subtitle
    ? `<p class="hero-subtitle">${escapeHtml(subtitle)}</p>`
    : '';
  return `<section class="hero">
  <div class="hero-cover" style="background-image:linear-gradient(rgba(0,0,0,0.12),rgba(0,0,0,0.35)),url(&quot;${escapeHtml(background)}&quot;)"></div>
  <div class="hero-inner container">
    <h1 class="hero-title">${escapeHtml(title)}</h1>
    ${subHtml}
  </div>
</section>
`;
}

export function layout(title, bodyHtml, extraHead = '', opts = {}) {
  const nav = NAV.map(
    (n) =>
      `<a class="nav-link" href="${n.href}">${n.icon}<span>${n.label}</span></a>`
  ).join('');
  const subtitle = SITE.subtitle
    ? `<span class="site-subtitle">${SITE.subtitle}</span>`
    : '';
  const faviconLink = SITE.favicon
    ? `<link rel="icon" href="${escapeHtml(SITE.favicon)}">`
    : '';
  const hero = opts.hero
    ? heroHtml(typeof opts.hero === 'object' ? opts.hero : {})
    : '';
  const mainClasses = ['container'];
  if (opts.mainClass) mainClasses.push(opts.mainClass);
  if (!hero) mainClasses.push('no-hero'); // 无 hero：用 margin 补偿 fixed 顶栏的高度
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
${faviconLink}
<link rel="stylesheet" href="/style.css">
<link rel="stylesheet" href="/prism.css">
${extraHead}
</head>
<body>
<header class="site-header">
  <div class="container site-nav">
    <a class="site-title" href="/">${SITE.title}</a>
    ${subtitle}
    <button type="button" class="nav-toggle" data-nav-toggle aria-controls="site-menu" aria-expanded="false" aria-label="打开菜单">
      <svg class="icon-burger" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
      <svg class="icon-close" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </button>
    <nav class="site-menu" id="site-menu" aria-label="主菜单">${nav}</nav>
  </div>
</header>
${hero}
<main class="${mainClasses.join(' ')}">
${bodyHtml}
</main>
<footer class="site-footer">
  <div class="container">
    <p>Powered by <strong>Quill</strong></p>
  </div>
</footer>
<script src="/main.js" defer></script>
</body>
</html>`;
}