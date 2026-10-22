const appMain = document.getElementById('app-main');
const appNav = document.getElementById('app-nav');

function renderRoute(path, focus = false) {
  const templateId = path === '/' ? 'tpl-home' : path === '/page-two' ? 'tpl-page-two' : undefined;
  if (templateId) {
    appMain.replaceChildren(document.getElementById(templateId).content.cloneNode(true));
    appMain
      .querySelector('[data-utilities]')
      .replaceWith(document.getElementById('tpl-utilities').content.cloneNode(true));
  } else {
    const heading = document.createElement('h1');
    heading.textContent = 'Page not found';
    appMain.replaceChildren(heading);
  }
  for (const link of appNav.querySelectorAll('a')) {
    const active = new URL(link.href).pathname === path;
    link.classList.toggle('active', active);
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  document.title = `${path === '/' ? 'Home' : path === '/page-two' ? 'Page Two' : 'Page not found'} – Contentful Experiences`;
  appMain.scrollTop = 0;
  if (focus) appMain.focus();
}

document.addEventListener('click', (event) => {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  )
    return;
  const link = event.target.closest('a[href]');
  if (!link || link.hasAttribute('download') || (link.target && link.target !== '_self')) return;
  const url = new URL(link.href);
  if (url.origin !== location.origin || url.hash) return;
  event.preventDefault();
  history.pushState(null, '', url.pathname + url.search);
  renderRoute(url.pathname, true);
});

window.addEventListener('popstate', () => renderRoute(location.pathname, true));
renderRoute(location.pathname);
