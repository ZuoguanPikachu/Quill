// Quill Blog — 分页工具
// PER_PAGE：每页文章数；paginate：切页；pageUrl：页码 URL；renderPager：分页导航 HTML

export const PER_PAGE = 8;

/** 计算第 page 页的切片（1 基），返回 { current, total, items } */
export function paginate(posts, page) {
  const total = Math.max(1, Math.ceil(posts.length / PER_PAGE));
  const current = Math.min(Math.max(1, page), total);
  const start = (current - 1) * PER_PAGE;
  return { current, total, items: posts.slice(start, start + PER_PAGE) };
}

/** 第 pageNum 页的 URL：basePath 为空表示首页根路径，否则为 /分类/标签 的前缀 */
export function pageUrl(basePath, pageNum) {
  if (pageNum <= 1) return basePath ? `${basePath}/` : '/';
  return `${basePath ? `${basePath}/` : '/'}page/${pageNum}/`;
}

/** 渲染分页导航，总页数 <= 1 时不输出 */
export function renderPager(basePath, current, total) {
  if (total <= 1) return '';
  const item = (n, label, cls = '', active = false) =>
    active
      ? `<span class="pager-item active">${label}</span>`
      : `<a class="pager-item${cls ? ` ${cls}` : ''}" href="${pageUrl(basePath, n)}">${label}</a>`;
  const parts = [
    current > 1
      ? item(current - 1, '‹ 上一页', 'prev')
      : '<span class="pager-item disabled">‹ 上一页</span>',
  ];
  for (let n = 1; n <= total; n++) parts.push(item(n, String(n), '', n === current));
  parts.push(
    current < total
      ? item(current + 1, '下一页 ›', 'next')
      : '<span class="pager-item disabled">下一页 ›</span>'
  );
  return `<nav class="pager" aria-label="分页">${parts.join('\n')}</nav>`;
}