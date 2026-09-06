// Quill Blog — 友链页模板
import { layout, escapeHtml, SITE } from './layout.js';

export function renderFriends(friends) {
  const hero = SITE.banner
    ? {
        title: '友链',
        subtitle: friends.length
          ? `共 ${friends.length} 个友链`
          : '还没有友链，编辑 source/_data/friends.yml 添加',
      }
    : null;
  if (friends.length === 0) {
    const body = `
<section class="term-page">
  ${hero ? '' : `<h1 class="page-title">友链</h1>`}
  ${hero ? '' : '<p class="list-count">还没有友链。编辑 source/_data/friends.yml 添加。</p>'}
</section>`;
    return layout(`友链 · ${SITE.title}`, body, '', hero ? { hero } : {});
  }
  const items = friends
    .map((f) => {
      const avatar = f.avatar
        ? `<img class="friend-avatar" src="${escapeHtml(f.avatar)}" alt="" referrerpolicy="no-referrer">`
        : `<span class="friend-avatar friend-avatar-fallback">${escapeHtml(f.name.slice(0, 1))}</span>`;
      return `
  <li class="friend-card">
    <a class="friend-link" href="${escapeHtml(f.url)}" target="_blank" rel="noopener noreferrer">
      ${avatar}
      <span class="friend-info">
        <span class="friend-name">${escapeHtml(f.name)}</span>
        ${f.desc ? `<span class="friend-desc">${escapeHtml(f.desc)}</span>` : ''}
      </span>
    </a>
  </li>`;
    })
    .join('');
  const body = `
<section class="term-page">
  ${hero ? '' : `<h1 class="page-title">友链</h1>`}
  ${hero ? '' : `<p class="list-count">共 ${friends.length} 个友链</p>`}
  <ul class="friend-grid">${items}
  </ul>
</section>`;
  return layout(`友链 · ${SITE.title}`, body, '', hero ? { hero } : {});
}