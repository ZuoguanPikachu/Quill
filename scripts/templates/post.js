// Quill Blog — 单篇文章页模板
import { layout, escapeHtml, SITE } from './layout.js';

/** index_img 的文章页大图 URL：追加 COS imageMogr2 缩略参数（等比缩到 1600x900 内，仅缩不放） */
export function bannerUrl(url) {
  if (!url) return '';
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}imageMogr2/thumbnail/1600x900>`;
}

export function renderPostPage(post) {
  const tags = post.tags
    .map(
      (t) =>
        `<a class="tag" href="/tags/${encodeURIComponent(t)}/">${escapeHtml(t)}</a>`
    )
    .join('');
  const cats = post.categories
    .map(
      (c) =>
        `<a class="cat" href="/categories/${encodeURIComponent(c)}/">${escapeHtml(c)}</a>`
    )
    .join(' ');
  // 文章页 hero：与首页同款大图横幅，背景图用文章自己的 index_img（缺省回退站点 banner）
  const heroBg = post.indexImg ? bannerUrl(post.indexImg) : SITE.banner;
  const hero = heroBg ? { background: heroBg, title: post.title } : null;
  const titleHtml = hero
    ? ''
    : `<h1 class="post-title">${escapeHtml(post.title)}</h1>`;
  const body = `
<article class="post page">
  <header class="post-header">
    ${titleHtml}
    <div class="post-meta">
      <time datetime="${post.dateText}">${post.dateText}</time>
      ${cats ? `<span class="sep">·</span> ${cats}` : ''}
    </div>
    <div class="post-tags">${tags}</div>
  </header>
  <div class="post-content">
${post.body}
  </div>
</article>`;
  return layout(`${post.title} · ${SITE.title}`, body, '', hero ? { hero } : {});
}