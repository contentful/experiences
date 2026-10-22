import { createControlPanel } from './control-panel.js';
import { renderExperience } from './experiences.js';
import { createTrackingLog } from './tracking.js';
import { cloneTemplate } from './templates.js';

const appMain = document.getElementById('app-main');
const appNav = document.getElementById('app-nav');
const env = window.ENVIRONMENT;
// Consumer integration: keep one SDK for this browser app's lifetime; it owns profile,
// consent, persistence and delivery. UMD and window.ENVIRONMENT are this app's
// loading/configuration choices; the delivery token must be safe to expose publicly.
const sdk = new window.ContentfulExperiences({
  spaceId: env.SPACE_ID,
  environmentId: env.ENVIRONMENT_ID,
  locale: env.LOCALE,
  delivery: { accessToken: env.CDA_TOKEN },
});
const experienceIds = env.EXPERIENCE_IDS;
// Reference app: these routes and Experience selections form the demonstration.
const routes = {
  '/': {
    template: 'home',
    title: 'Home',
    auto: experienceIds,
    grids: ['auto-observed', 'manually-observed'],
  },
  '/page-two': {
    template: 'page-two',
    title: 'Page Two',
    auto: experienceIds.slice(-1),
    grids: ['page-two-auto-grid', 'page-two-manual-grid'],
  },
};
// Maintainer: optional attempt diagnostics, subscribed before the first event.
const trackingLog = createTrackingLog(sdk);
// Consumer integration: pass resolver registrations on fetch. These bindings need no
// resolveData hooks, so the registries are empty; DOM rendering is separate.
const resolveOptions = { config: { components: {}, experienceTemplates: {} } };
// Reference app: these guards coordinate this vanilla SPA's overlapping actions.
// A framework/router may own equivalent cancellation and lifecycle handling.
let generation = 0;
let pageGeneration = 0;
let disposed = false;
let pendingPage = Promise.resolve();
let trackingSession;
let pendingTrackingStop = Promise.resolve();
let renderInstance = 0;

function stopTracking() {
  if (trackingSession) {
    const active = trackingSession;
    trackingSession = undefined;
    pendingTrackingStop = active.stop();
  }
  return pendingTrackingStop;
}

// Reference app: a fixed URL identity makes personalization easy to verify.
// Consumers supply identity from their own application; this is not authentication.
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
  const content = cloneTemplate('status');
  const message = content.firstElementChild;
  message.setAttribute('role', error ? 'alert' : 'status');
  message.textContent = text;
  const button = content.querySelector('button');
  if (retry) {
    button.addEventListener('click', () => {
      void renderRoute({ sendPage: initialize || !sdk.states.profile.current?.id });
    });
  } else button.remove();
  target.replaceChildren(content);
}

async function renderRoute({ sendPage = false, focus = false } = {}) {
  const current = ++generation;
  const isCurrent = () => !disposed && current === generation;
  // Consumer integration, when tracking: stop before removing tracked DOM and retain the
  // session's attribution lookup through its final events.
  // A rapid second action joins an already-running stop before replacing DOM.
  await stopTracking();
  if (!isCurrent()) return;
  const path = location.pathname;
  const identifyRequested = new URL(location.href).searchParams.get('userId') === 'charles';
  const route = routes[path];
  for (const link of appNav.querySelectorAll('a')) {
    const linkPath = new URL(link.href).pathname;
    link.href = routeUrl(linkPath);
    const active = linkPath === path;
    link.classList.toggle('active', active);
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  document.title = `${route?.title ?? 'Page not found'} – Contentful Experiences`;
  appMain.scrollTop = 0;
  appMain.removeAttribute('aria-busy');
  if (!route) {
    const heading = document.createElement('h1');
    heading.textContent = 'Page not found';
    appMain.replaceChildren(heading);
    return;
  }
  appMain.replaceChildren(
    cloneTemplate(route.template),
    cloneTemplate('utilities'),
    cloneTemplate('content')
  );
  for (const link of appMain.querySelectorAll('a[href]'))
    link.href = routeUrl(new URL(link.href).pathname);
  controls.wire();
  if (path === '/page-two') {
    // Reference app: this button demonstrates a custom event independently of XDA.
    appMain.querySelector('.sections-grid').dataset.testid = 'page-two-experiences';
    const actions = appMain.querySelector('[data-custom-action]');
    const status = actions.querySelector('[role="status"]');
    actions.querySelector('button').addEventListener('click', async () => {
      try {
        const result = await sdk.track({ event: 'reference_custom_action' });
        status.textContent = result.accepted
          ? 'Custom event admitted; delivery unconfirmed.'
          : 'Custom event not admitted.';
      } catch {
        status.textContent = 'Unable to record the custom action.';
      }
    });
    appMain.querySelector('.control-panel').appendChild(actions);
  }
  if (focus) appMain.focus();

  const errorPanel = document.getElementById('content-error');
  appMain.setAttribute('aria-busy', 'true');
  const destinations = new Map();
  // Reference app: compare automatic discovery with explicit element registration,
  // reusing one fetched plan for each ID. The SDK measures both presentations.
  for (const [index, section] of ['auto', 'manual'].entries()) {
    const parent = appMain.querySelector(`[data-experiences="${section}"]`);
    parent.id = route.grids[index];
    for (const id of section === 'auto' ? route.auto : [experienceIds[0]]) {
      const target = document.createElement('div');
      Object.assign(target.dataset, { experienceId: id, section });
      showStatus(target, 'Loading Experience content…');
      parent.appendChild(target);
      if (!destinations.has(id)) destinations.set(id, []);
      destinations.get(id).push({ section, target });
    }
  }

  try {
    if (sendPage) {
      const pageRequest = ++pageGeneration;
      const properties = { url: location.href, title: document.title };
      // XDA workaround: establish SDK-owned identity first; initial XDA identify can time out.
      // Remove the independent page only after initial event-bearing XDA fetches
      // reliably create a profile and select the expected variant (README).
      pendingPage = pendingPage
        .catch(() => {})
        .then(async () => {
          if (disposed || pageRequest !== pageGeneration) return;
          const result = await sdk.page({ properties });
          if (!disposed && pageRequest === pageGeneration && !result.accepted)
            throw new Error('Page event was not admitted.');
        });
    }
    // Identify joins any initial page; it does not emit another page or identify call.
    await pendingPage;
    if (!isCurrent()) return;
    if (!sdk.states.profile.current?.id) throw new Error('Visitor profile is not available.');
    const identifyEvent = identifyRequested
      ? sdk.eventBuilder.buildIdentify({ userId: 'charles', traits: { identified: true } })
      : undefined;
    const attribution = new Map();
    // Consumer integration, when using automatic tracking: give the SDK the actual scrolling
    // view root and a lookup for the scopes stamped by the renderer. Detectors,
    // dwell times, consent and event delivery remain SDK-owned.
    trackingSession = sdk.startInteractionTracking({
      root: appMain,
      views: { root: appMain },
      resolveAttribution: (key) => attribution.get(key),
    });
    let failed = false;
    for (const [experienceId, targets] of destinations) {
      if (!isCurrent()) return;
      try {
        const plan = await sdk.fetchExperience(
          {
            experienceId,
            // Consumer integration, when tracking: request source maps to obtain attribution.
            extensions: { sourceMap: {} },
            // XDA workaround: profile-only selection can return baseline. Reuse one built
            // identify across this cycle's fetches until equivalent profile-only
            // selection is verified; Client owns wire normalization (README).
            ...(identifyEvent ? { personalization: { events: [identifyEvent] } } : {}),
          },
          resolveOptions
        );
        if (!isCurrent()) return;
        // Build each presentation before committing, so a render failure stays local.
        const namespace = `plan-${++renderInstance}`;
        // Consumer integration, with multiple plans: local scope keys can collide. Prefix
        // them consistently in DOM/lookup, retaining shared keys within each plan.
        const manualRoots = [];
        const rendered = targets.map(({ section }) =>
          renderExperience(plan, experienceId, section, {
            namespace,
            onManualRoot: (element, data) => manualRoots.push({ element, data }),
          })
        );
        for (const [key, scope] of Object.entries(plan.attribution?.scopes ?? {})) {
          attribution.set(`${namespace}:${key}`, scope);
        }
        targets.forEach(({ target }, index) => target.replaceChildren(rendered[index]));
        // Consumer integration: register after insertion, as in Optimization's
        // manually observed section. SDK observers own consent, dwell and duration.
        for (const { element, data } of manualRoots) {
          sdk.tracking.clearElement('views', element);
          sdk.tracking.enableElement('views', element, { data });
        }
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

// Reference app: a small SPA router. SDK consumers can use their existing router.
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
  if (url.origin !== location.origin || url.hash || !Object.hasOwn(routes, url.pathname)) return;
  event.preventDefault();
  history.pushState(null, '', routeUrl(url.pathname + url.search));
  void renderRoute({ sendPage: true, focus: true });
});
window.addEventListener('popstate', () => void renderRoute({ sendPage: true, focus: true }));
window.addEventListener('pagehide', async (event) => {
  // Consumer integration: release caller-owned tracking/subscriptions before SDK destruction.
  // A back/forward-cache suspension keeps this instance alive for resumption.
  if (event.persisted) return;
  disposed = true;
  generation += 1;
  try {
    await stopTracking();
  } catch {
    window.console.error('Unable to finish the interaction tracking session.');
  } finally {
    trackingLog.dispose();
    controls.dispose();
    sdk.destroy();
  }
});
void renderRoute({ sendPage: true });
