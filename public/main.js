// Quill Blog — 全站脚本（构建时输出到 public/main.js）
// 目前只做一件事：代码块的「复制」按钮。
// 行号由 CSS 计数器生成（::before），不会进入复制内容。

// —— 移动端导航开关（汉堡按钮 → 下拉菜单）——
const navToggle = document.querySelector('[data-nav-toggle]');
const siteMenu = document.getElementById('site-menu');

function setMenu(open) {
  if (!navToggle || !siteMenu) return;
  siteMenu.classList.toggle('open', open);
  navToggle.classList.toggle('open', open);
  navToggle.setAttribute('aria-expanded', String(open));
  navToggle.setAttribute('aria-label', open ? '收起菜单' : '打开菜单');
}

if (navToggle && siteMenu) {
  navToggle.addEventListener('click', () => {
    setMenu(!siteMenu.classList.contains('open'));
  });
  // 点击菜单里的链接后自动收起
  siteMenu.addEventListener('click', (e) => {
    if (e.target.closest('a')) setMenu(false);
  });
  // 点击顶栏以外区域自动收起；Esc 也收起
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.site-header')) setMenu(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') setMenu(false);
  });
}

// —— 顶栏下滑收缩：滚动超过阈值加 header-shrunk（高度过渡由 CSS 负责），回顶恢复 ——
const siteHeader = document.querySelector('.site-header');
const updateHeaderState = () => {
  if (!siteHeader) return;
  siteHeader.classList.toggle('header-shrunk', window.scrollY > 10);
};
window.addEventListener('scroll', updateHeaderState, { passive: true });
updateHeaderState();

// —— 移动端 banner 视差（仅当背景不是整页固定图层时启用，桌面 fixed 层自动跳过）——
const heroEl = document.querySelector('.hero');
const heroCover = heroEl && heroEl.querySelector('.hero-cover');
if (heroEl && heroCover && getComputedStyle(heroCover).position !== 'fixed') {
  let ticking = false;
  const updateParallax = () => {
    ticking = false;
    const rect = heroEl.getBoundingClientRect();
    // 已完全滚出视口则不处理
    if (rect.bottom < 0 || rect.top > window.innerHeight) return;
    // 背景上移速度约为页面 65%（只走 35%），限制在 cover 预留的余量内
    const offset = Math.max(-96, Math.min(96, rect.top * -0.35));
    heroCover.style.transform = `translateY(${offset}px)`;
  };
  const onScroll = () => {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(updateParallax);
    }
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  updateParallax();
}

document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-code-copy]');
  if (!btn) return;
  const block = btn.closest('.code-block');
  if (!block) return;
  const codeEl = block.querySelector('code');
  if (!codeEl) return;

  // innerText 只取实际文本，不含 CSS 生成的行号
  const text = codeEl.innerText;

  const done = () => {
    const original = btn.textContent;
    btn.textContent = '已复制';
    setTimeout(() => {
      btn.textContent = original;
    }, 1500);
  };

  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard
      .writeText(text)
      .then(done)
      .catch(() => fallbackCopy(text, done));
  } else {
    fallbackCopy(text, done);
  }
});

function fallbackCopy(text, done) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand('copy');
  } catch {
    /* 复制失败则忽略 */
  }
  document.body.removeChild(ta);
  done();
}