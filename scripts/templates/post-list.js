// Quill Blog — 文章列表模板（首页 / 分类 / 标签 共用）
// 卡片含封面缩略图、标题（PC 单行省略、移动端 2 行）、元信息与摘要。
import { layout, escapeHtml, SITE } from './layout.js';
import { paginate, renderPager } from './pager.js';

/** index_img 的卡片封面 URL：追加 COS imageMogr2 缩略参数（等比缩到 600x300 内） */
export function coverUrl(url) {
  if (!url) return '';
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}imageMogr2/thumbnail/600x300>`;
}

export function renderPostList(
  posts,
  title,
  extraNote = '',
  pager = null,
  totalCount = posts.length,
  opts = {}
) {
  const hero = opts.hero; // 对象（自带标题/副标题）或 falsy：有 hero 时标题与计数移入横幅
  const list = posts
    .map((p) => {
      const cover = p.indexImg
        ? `  <a class="post-card-cover" href="/posts/${encodeURIComponent(p.slug)}/" tabindex="-1" aria-hidden="true">
    <img src="${escapeHtml(coverUrl(p.indexImg))}" alt="${escapeHtml(p.title)}" loading="lazy">
  </a>`
        : '';
      return `
  <li class="post-card">
${cover}
    <div class="post-card-body">
    <h2 class="post-card-title"><a href="/posts/${encodeURIComponent(p.slug)}/" title="${escapeHtml(p.title)}">${escapeHtml(p.title)}</a></h2>
    <div class="post-meta">
      <time datetime="${p.dateText}">${p.dateText}</time>
      ${p.categories.length ? `<span class="sep">·</span> ${p.categories.map((c) => `<a class="cat" href="/categories/${encodeURIComponent(c)}/">${escapeHtml(c)}</a>`).join(' ')}` : ''}
      ${p.tags.length ? `<span class="sep">·</span> ${p.tags.map((t) => `<a class="tag" href="/tags/${encodeURIComponent(t)}/">${escapeHtml(t)}</a>`).join(' ')}` : ''}
    </div>
    <p class="post-card-excerpt">${escapeHtml(p.excerpt)}${p.excerpt.length >= 160 ? '…' : ''}</p>
    </div>
  </li>`;
    })
    .join('\n');
  const heading = title && !hero ? `<h1 class="page-title">${title}</h1>` : '';
  const countNote = !hero ? extraNote || `共 ${totalCount} 篇文章` : '';
  const nav = pager ? renderPager(pager.basePath, pager.current, pager.total) : '';
  const body = `
<section class="post-list">
  ${heading}
  ${countNote ? `<p class="list-count">${countNote}</p>` : ''}
  <ul class="post-list">
${list}
  </ul>
  ${nav}
</section>`;
  const layoutOpts = {};
  if (hero) layoutOpts.hero = hero;
  if (opts.mainClass) layoutOpts.mainClass = opts.mainClass;
  return layout(
    title ? `${title} · ${SITE.title}` : SITE.title,
    body,
    '',
    layoutOpts
  );
}

export function renderIndex(posts, page = 1) {
  const pg = paginate(posts, page);
  const listOpts = { hero: SITE.banner ? {} : null };
  if (SITE.banner) {
    listOpts.mainClass = 'main-translucent'; // 首页所有分页：内容列更透明，透出固定背景图
  }
  return renderPostList(
    pg.items,
    null,
    '',
    { basePath: '', current: pg.current, total: pg.total },
    posts.length,
    listOpts
  );
}