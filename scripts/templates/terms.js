// Quill Blog — 分类 & 标签模板（总览 + 列表页）
import { layout, escapeHtml, SITE } from './layout.js';
import { paginate } from './pager.js';
import { renderPostList } from './post-list.js';

/** 统计 posts 上某字段（categories/tags）的出现情况，返回 [{name, posts:[...]}] */
export function groupBy(posts, field) {
  const map = new Map();
  for (const p of posts) {
    for (const name of p[field]) {
      if (!map.has(name)) map.set(name, []);
      map.get(name).push(p);
    }
  }
  const groups = [...map.entries()].map(([name, list]) => ({
    name,
    posts: list.sort((a, b) => b.date - a.date),
  }));
  // 文章多的排前面，其次按名称
  groups.sort((a, b) => b.posts.length - a.posts.length || a.name.localeCompare(b.name, 'zh'));
  return groups;
}

export function renderCategoriesOverview(groups) {
  const items = groups
    .map((g, i) => {
      const hue = (i * 47 + 30) % 360;
      return `
  <li class="term-card">
    <a class="term-link" href="/categories/${encodeURIComponent(g.name)}/" style="--h:${hue}">
      <span class="term-avatar">${escapeHtml(g.name.slice(0, 1))}</span>
      <span class="term-info">
        <span class="term-name">${escapeHtml(g.name)}</span>
        <span class="term-count">${g.posts.length} 篇</span>
      </span>
    </a>
  </li>`;
    })
    .join('');
  const hero = SITE.banner
    ? { title: '分类', subtitle: `共 ${groups.length} 个分类` }
    : null;
  const body = `
<section class="term-page">
  ${hero ? '' : `<h1 class="page-title">分类</h1>`}
  ${hero ? '' : `<p class="list-count">共 ${groups.length} 个分类</p>`}
  <ul class="term-grid">${items}
  </ul>
</section>`;
  return layout(`分类 · ${SITE.title}`, body, '', hero ? { hero } : {});
}

/** 由字符串生成稳定的 0~1 散列，用于词云配色，保证每次构建一致 */
function hash01(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

/** Fisher–Yates 洗牌（构建时随机，每次构建顺序不同） */
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function renderTagsOverview(groups) {
  // 随机排列：构建时洗牌打散，打破"从大到小"的顺序
  const shuffled = shuffle(groups);
  const max = Math.max(1, ...groups.map((g) => g.posts.length));
  const items = shuffled
    .map((g) => {
      const size = 0.85 + (g.posts.length / max) * 0.9; // 0.85 ~ 1.75rem
      const hue = Math.round(hash01(g.name) * 360);
      return `<a class="tag-cloud-item" href="/tags/${encodeURIComponent(g.name)}/" style="font-size:${size.toFixed(2)}rem;--th:${hue}">${escapeHtml(g.name)} <small>${g.posts.length}</small></a>`;
    })
    .join('');
  const hero = SITE.banner
    ? { title: '标签', subtitle: `共 ${groups.length} 个标签` }
    : null;
  const body = `
<section class="term-page">
  ${hero ? '' : `<h1 class="page-title">标签</h1>`}
  ${hero ? '' : `<p class="list-count">共 ${groups.length} 个标签</p>`}
  <div class="tag-cloud">${items}
  </div>
</section>`;
  return layout(`标签 · ${SITE.title}`, body, '', hero ? { hero } : {});
}

export function renderTermPage(kind, name, posts, page = 1) {
  const pageTitle = kind === 'categories' ? `分类：${name}` : `标签：${name}`;
  const basePath =
    kind === 'categories'
      ? `/categories/${encodeURIComponent(name)}`
      : `/tags/${encodeURIComponent(name)}`;
  const pg = paginate(posts, page);
  const hero = SITE.banner
    ? {
        title: pageTitle,
        subtitle: `${name} 下共 ${posts.length} 篇文章`,
      }
    : null;
  return renderPostList(
    pg.items,
    pageTitle,
    `${name} 下共 ${posts.length} 篇文章`,
    { basePath, current: pg.current, total: pg.total },
    posts.length,
    hero ? { hero } : {}
  );
}