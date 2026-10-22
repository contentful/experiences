import { createControlPanel } from './control-panel.js';
import { renderExperience } from './experiences.js';

const appMain = document.getElementById('app-main');
const appNav = document.getElementById('app-nav');
const env = window.ENVIRONMENT;
const sdk = new window.ContentfulExperiences({
  spaceId: env.SPACE_ID,
  environmentId: env.ENVIRONMENT_ID,
  locale: env.LOCALE,
  delivery: { accessToken: env.CDA_TOKEN },
});
const experienceIds = env.EXPERIENCE_IDS;
const resolveOptions = { config: { components: {}, experienceTemplates: {} } };
let generation = 0;
let pageGeneration = 0;
let disposed = false;
let pendingPage = Promise.resolve();

const controls = createControlPanel(sdk, {
  onIdentify() {
    const url = new URL(location.href);
    url.searchParams.set('userId', 'charles');
    history.replaceState(null, '', url.pathname + url.search);
    void renderRoute();
  },
  onReset() {
    const url = new URL(location.href);
    url.searchParams.delete('userId');
    history.replaceState(null, '', url.pathname + url.search);
    sdk.reset();
    void renderRoute({ sendPage: true });
  },
});

function routeUrl(path) {
  const url = new URL(path, location.origin);
  if (new URL(location.href).searchParams.get('userId') === 'charles') {
    url.searchParams.set('userId', 'charles');
  } else {
    url.searchParams.delete('userId');
  }
  return url.pathname + url.search;
}

function showStatus(target, text, { error = false, retry = false, initialize = false } = {}) {
  const message = document.createElement('div');
  message.className = 'placeholder-card';
  message.setAttribute('role', error ? 'alert' : 'status');
  message.textContent = text;
  target.replaceChildren(message);
  if (retry) {
    const button = document.createElement('button');
    button.className = 'btn btn--sm btn--secondary';
    button.dataset.testid = 'retry-experiences-button';
    button.textContent = 'Retry content';
    button.addEventListener('click', () => {
      void renderRoute({ sendPage: initialize || !sdk.states.profile.current?.id });
    });
    target.appendChild(button);
  }
}

async function renderRoute({ sendPage = false, focus = false } = {}) {
  const current = ++generation;
  const isCurrent = () => !disposed && current === generation;
  const path = location.pathname;
  const identifyRequested = new URL(location.href).searchParams.get('userId') === 'charles';
  const templateId = path === '/' ? 'tpl-home' : path === '/page-two' ? 'tpl-page-two' : undefined;
  for (const link of appNav.querySelectorAll('a')) {
    const linkPath = new URL(link.href).pathname;
    link.href = routeUrl(linkPath);
    const active = linkPath === path;
    link.classList.toggle('active', active);
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  document.title = `${path === '/' ? 'Home' : path === '/page-two' ? 'Page Two' : 'Page not found'} – Contentful Experiences`;
  appMain.scrollTop = 0;
  appMain.removeAttribute('aria-busy');
  if (!templateId) {
    const heading = document.createElement('h1');
    heading.textContent = 'Page not found';
    appMain.replaceChildren(heading);
    return;
  }
  appMain.replaceChildren(document.getElementById(templateId).content.cloneNode(true));
  appMain
    .querySelector('[data-utilities]')
    .replaceWith(document.getElementById('tpl-utilities').content.cloneNode(true));
  for (const link of appMain.querySelectorAll('a[href]'))
    link.href = routeUrl(new URL(link.href).pathname);
  controls.wire();
  if (focus) appMain.focus();

  const errorPanel = document.getElementById('content-error');
  appMain.setAttribute('aria-busy', 'true');
  const destinations = new Map();
  const addDestination = (id, section, parent) => {
    const target = document.createElement('div');
    target.dataset.experienceId = id;
    target.dataset.section = section;
    showStatus(target, 'Loading Experience content…');
    parent.appendChild(target);
    if (!destinations.has(id)) destinations.set(id, []);
    destinations.get(id).push({ section, target });
  };
  if (path === '/') {
    for (const id of experienceIds)
      addDestination(id, 'auto', document.getElementById('auto-observed'));
    addDestination(experienceIds[0], 'manual', document.getElementById('manually-observed'));
  } else {
    addDestination(experienceIds.at(-1), 'auto', document.getElementById('page-two-auto-grid'));
    addDestination(experienceIds[0], 'manual', document.getElementById('page-two-manual-grid'));
  }

  try {
    if (sendPage) {
      const pageRequest = ++pageGeneration;
      const previousPage = pendingPage;
      const pageUrl = location.href;
      const pageTitle = document.title;
      // Establish SDK-owned identity first: initial XDA identify can time out.
      // Remove the independent page only after initial event-bearing XDA fetches
      // reliably create a profile and select the expected variant (README).
      pendingPage = (async () => {
        await previousPage.catch(() => {});
        if (disposed || pageRequest !== pageGeneration) return;
        const result = await sdk.page({ properties: { url: pageUrl, title: pageTitle } });
        if (!disposed && pageRequest === pageGeneration && !result.accepted)
          throw new Error('Page event was not admitted.');
      })();
    }
    // Identify joins any initial page; it does not emit another page or identify call.
    await pendingPage;
    if (!isCurrent()) return;
    if (!sdk.states.profile.current?.id) throw new Error('Visitor profile is not available.');
    const identifyEvent = identifyRequested
      ? sdk.eventBuilder.buildIdentify({ userId: 'charles', traits: { identified: true } })
      : undefined;
    let failed = false;
    for (const [experienceId, targets] of destinations) {
      if (!isCurrent()) return;
      try {
        const plan = await sdk.fetchExperience(
          {
            experienceId,
            // XDA profile-only selection can return baseline. Reuse one fresh built
            // identify across this cycle's fetches until equivalent profile-only
            // selection is verified; Client owns wire normalization (README).
            ...(identifyEvent ? { personalization: { events: [identifyEvent] } } : {}),
          },
          resolveOptions
        );
        if (!isCurrent()) return;
        // Build each presentation before committing, so a render failure stays local.
        const rendered = targets.map(({ section }) =>
          renderExperience(plan, experienceId, section)
        );
        targets.forEach(({ target }, index) => target.replaceChildren(rendered[index]));
      } catch (error) {
        if (!isCurrent()) return;
        failed = true;
        // The UMD may minify constructor names; Delivery exposes a stable statusCode.
        const message =
          error?.statusCode === 404
            ? 'This Experience was not found.'
            : 'This Experience could not be loaded or rendered. Retry the content request.';
        targets.forEach(({ target }) => showStatus(target, message, { error: true }));
      }
    }
    if (!isCurrent()) return;
    appMain.removeAttribute('aria-busy');
    if (failed) {
      errorPanel.hidden = false;
      showStatus(errorPanel, 'Some Experience content is unavailable.', {
        error: true,
        retry: true,
      });
    }
  } catch {
    if (!isCurrent()) return;
    appMain.removeAttribute('aria-busy');
    errorPanel.hidden = false;
    showStatus(
      errorPanel,
      'A visitor profile could not be established. Check your connection and retry.',
      { error: true, retry: true, initialize: true }
    );
    for (const targets of destinations.values()) {
      targets.forEach(({ target }) =>
        showStatus(target, 'Content is unavailable until visitor initialization succeeds.')
      );
    }
  }
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
  if (url.origin !== location.origin || url.hash || !['/', '/page-two'].includes(url.pathname))
    return;
  event.preventDefault();
  history.pushState(null, '', routeUrl(url.pathname + url.search));
  void renderRoute({ sendPage: true, focus: true });
});
window.addEventListener('popstate', () => void renderRoute({ sendPage: true, focus: true }));
window.addEventListener('pagehide', (event) => {
  if (event.persisted) return;
  disposed = true;
  generation += 1;
  controls.dispose();
  sdk.destroy();
});
void renderRoute({ sendPage: true });
