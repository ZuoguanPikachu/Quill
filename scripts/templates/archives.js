// Quill Blog — 归档页模板（按年份分组）
import { layout, escapeHtml, SITE } from './layout.js';

export function renderArchives(posts) {
  const byYear = new Map();
  for (const p of posts) {
    const year = p.dateText.slice(0, 4) || '未知';
    if (!byYear.has(year)) byYear.set(year, []);
    byYear.get(year).push(p);
  }
  const years = [...byYear.keys()].sort((a, b) => b.localeCompare(a));

  const html = years
    .map((year) => {
      const items = byYear
        .get(year)
        .map(
          (p) => `
    <li class="archive-item">
      <time class="archive-date" datetime="${p.dateText}">${p.dateText}</time>
      <a class="archive-title" href="/posts/${encodeURIComponent(p.slug)}/">${escapeHtml(p.title)}</a>
    </li>`
        )
        .join('');
      return `
  <section class="archive-year">
    <h2 class="archive-year-title">${year} <span class="archive-count">(${byYear.get(year).length})</span></h2>
    <ul class="archive-list">${items}
    </ul>
  </section>`;
    })
    .join('');

  const hero = SITE.banner
    ? { title: '归档', subtitle: `共 ${posts.length} 篇文章` }
    : null;
  const body = `
<section class="archives">
  ${hero ? '' : `<h1 class="page-title">归档</h1>`}
  ${hero ? '' : `<p class="list-count">共 ${posts.length} 篇文章</p>`}
${html}
</section>`;
  return layout(`归档 · ${SITE.title}`, body, '', hero ? { hero } : {});
}