import { createPreviewInitializer, getPreviewBinding } from '/dist/preview.js';
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
let previewBinding = getPreviewBinding(env, location.href);
const sdk = new window.ContentfulExperiences({
  spaceId: env.SPACE_ID,
  environmentId: env.ENVIRONMENT_ID,
  locale: env.LOCALE,
  delivery: { accessToken: env.CDA_TOKEN },
  preview: env.LIVE_PREVIEW
    ? { accessToken: env.LIVE_PREVIEW.accessToken, host: env.LIVE_PREVIEW.host }
    : undefined,
  livePreview: createPreviewInitializer(previewBinding),
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
let visitorGeneration = 0;
let disposed = false;
let pendingVisitorWork = Promise.resolve();
let manualElements = [];
let previewSubscriptions = [];

// Reference app: a fixed URL identity makes personalization easy to verify.
// Consumers supply identity from their own application; this is not authentication.
const controls = createControlPanel(sdk, {
  onIdentify() {
    const url = new URL(location.href);
    url.searchParams.set('userId', 'charles');
    history.replaceState(null, '', url.pathname + url.search);
    identifyVisitor();
    void renderRoute();
  },
  onReset() {
    const url = new URL(location.href);
    url.searchParams.delete('userId');
    history.replaceState(null, '', url.pathname + url.search);
    void renderRoute({ sendPage: true, reset: true });
  },
});

function routeUrl(path) {
  const url = new URL(path, location.origin);
  const current = new URL(location.href);
  for (const key of ['preview_session_id', 'preview_experience_id']) {
    if (!url.searchParams.has(key) && current.searchParams.has(key))
      url.searchParams.set(key, current.searchParams.get(key));
  }
  if (new URL(location.href).searchParams.get('userId') === 'charles') {
    url.searchParams.set('userId', 'charles');
  } else {
    url.searchParams.delete('userId');
  }
  return url.pathname + url.search;
}

function showStatus(target, text, { error = false, retry = false } = {}) {
  const content = cloneTemplate('status');
  const message = content.firstElementChild;
  message.setAttribute('role', error ? 'alert' : 'status');
  message.textContent = text;
  const button = content.querySelector('button');
  if (retry) {
    button.addEventListener('click', () => void renderRoute());
  } else button.remove();
  target.replaceChildren(content);
}

// Reference app: keep route orchestration separate from shell, visitor and content work.
async function renderRoute({ sendPage = false, focus = false, reset = false } = {}) {
  const nextBinding = getPreviewBinding(env, location.href);
  const nextIsPreview = Boolean(
    nextBinding || new URL(location.href).searchParams.get('preview_session_id')?.trim()
  );
  if (nextIsPreview !== sdk.isPreview) {
    location.reload();
    return;
  }
  const current = ++generation;
  releasePreviewSubscriptions();
  const isCurrent = () => !disposed && current === generation;
  const path = location.pathname;
  const route = routes[path];
  const previousManualElements = manualElements;
  manualElements = [];

  renderRouteShell(path, route);
  if (reset) {
    // SDK reset resumes discovery immediately; old attributed DOM is already removed.
    // Detach obsolete visitor work so it cannot delay the fresh page.
    visitorGeneration += 1;
    pendingVisitorWork = Promise.resolve();
    sdk.reset();
  }
  const visitorWork = !sdk.isPreview && route ? settleVisitorActions(sendPage) : undefined;
  // Consumer integration, manual observation only: release explicit registrations.
  // Let DOM removal finish measured intervals before clearing their overrides.
  // Reset already discarded the old measurements and overrides.
  await Promise.resolve();
  if (!reset)
    previousManualElements.forEach((element) => sdk.tracking.clearElement('views', element));
  if (!isCurrent() || !route) return;

  wireRouteControls(path, focus);
  const destinations = createDestinations(route);
  const errorPanel = document.getElementById('content-error');
  appMain.setAttribute('aria-busy', 'true');

  try {
    if (sdk.isPreview) {
      if (nextBinding && JSON.stringify(nextBinding) !== JSON.stringify(previewBinding)) {
        await sdk.replaceLivePreview(createPreviewInitializer(nextBinding));
        if (!isCurrent()) return;
        previewBinding = nextBinding;
      }
    } else {
      await visitorWork;
      if (!isCurrent()) return;
    }

    const failed = await loadExperiences(destinations, isCurrent);
    if (!isCurrent()) return;
    appMain.removeAttribute('aria-busy');
    if (failed && !sdk.isPreview) {
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
      sdk.isPreview
        ? 'Preview content could not be loaded. Check the session and retry.'
        : 'Experience content could not be loaded. Retry content to try again.',
      { error: true, retry: true }
    );
    for (const targets of destinations.values()) {
      targets.forEach(({ target }) =>
        showStatus(
          target,
          sdk.isPreview
            ? 'Preview content is unavailable. Retry content to try again.'
            : 'Experience content is unavailable. Retry content to try again.'
        )
      );
    }
  }
}

function renderRouteShell(path, route) {
  for (const link of appNav.querySelectorAll('a')) {
    const linkPath = new URL(link.href).pathname;
    link.dataset.routeHref ??= link.getAttribute('href');
    link.href = routeUrl(link.dataset.routeHref);
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
  } else {
    appMain.replaceChildren(
      cloneTemplate(route.template),
      cloneTemplate('utilities'),
      cloneTemplate('content')
    );
  }
}

function wireRouteControls(path, focus) {
  for (const link of appMain.querySelectorAll('a[href]')) link.href = routeUrl(link.href);
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
}

function createDestinations(route) {
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

  return destinations;
}

// Consumer integration: identify once for actual application intent. Online completion
// applies evaluated state before dependent content; offline admission does not prove
// evaluation. Navigation joins this work; reset invalidates an unsent old intent.
function identifyVisitor() {
  const visitor = visitorGeneration;
  pendingVisitorWork = pendingVisitorWork.then(async () => {
    if (disposed || visitor !== visitorGeneration) return;
    try {
      await sdk.identify({ userId: 'charles', traits: { identified: true } });
    } catch {
      if (!disposed && visitor === visitorGeneration)
        window.console.warn('Unable to complete the identify event.');
    }
  });
}

// Reference app: retain normal owned page sequencing through terminal outcomes.
// Refusal, rejection and offline admission do not make baseline content ineligible.
function settleVisitorActions(sendPage) {
  if (sendPage) {
    const visitor = visitorGeneration;
    const pageRequest = ++pageGeneration;
    const properties = { url: location.href, title: document.title };
    pendingVisitorWork = pendingVisitorWork.then(async () => {
      if (disposed || visitor !== visitorGeneration || pageRequest !== pageGeneration) return;
      try {
        await sdk.page({ properties });
      } catch {
        if (!disposed && visitor === visitorGeneration && pageRequest === pageGeneration)
          window.console.warn('Unable to complete the page event.');
      }
    });
  }
  return pendingVisitorWork;
}

async function loadExperiences(destinations, isCurrent) {
  const failures = new Set();
  const rendered = new Set();
  // Each ID uses the SDK's current identity after visitor actions settle. These
  // content requests have no dependency on another plan's result; the SDK guards
  // concurrent profile effects. Repeated presentations reuse the same fetched plan.
  await Promise.all(
    Array.from(destinations, async ([experienceId, targets]) => {
      if (!isCurrent()) return;
      try {
        const plan = await sdk.fetchExperience({ experienceId }, resolveOptions);
        if (!isCurrent()) return;
        renderPresentations(plan, experienceId, targets);
        rendered.add(experienceId);
        if (sdk.isPreview && (plan.diagnostics?.length || plan.deliveryDiagnostics?.length))
          failures.add(experienceId);
      } catch (error) {
        if (!isCurrent()) return;
        failures.add(experienceId);
        // The UMD may minify constructor names; Delivery exposes a stable statusCode.
        const message =
          error?.statusCode === 404
            ? 'This Experience was not found.'
            : 'This Experience could not be loaded or rendered. Retry the content request.';
        targets.forEach(({ target }) => showStatus(target, message, { error: true }));
      }
    })
  );
  if (sdk.isPreview && isCurrent()) bindPreview(destinations, isCurrent, failures, rendered);
  return failures.size > 0;
}

function renderPresentations(plan, experienceId, targets) {
  // Build each presentation before committing, so a render failure stays local.
  const manualRoots = [];
  const rendered = targets.map(({ section }) =>
    renderExperience(plan, experienceId, section, {
      onManualRoot: (element, data) => manualRoots.push({ element, data }),
    })
  );
  const removed = manualElements.filter((element) =>
    targets.some(({ target }) => target.contains(element))
  );
  manualElements = manualElements.filter((element) => !removed.includes(element));
  targets.forEach(({ target }, index) => target.replaceChildren(rendered[index]));
  void Promise.resolve().then(() =>
    removed.forEach((element) => sdk.tracking.clearElement('views', element))
  );
  // Consumer integration: register after insertion, as in Optimization's
  // manually observed section. SDK observers own consent, dwell and duration.
  for (const { element, data } of manualRoots) {
    sdk.tracking.clearElement('views', element);
    sdk.tracking.enableElement('views', element, { data });
    manualElements.push(element);
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
window.addEventListener('pagehide', (event) => {
  // Consumer integration: release caller-owned subscriptions on document unload.
  // A back/forward-cache suspension keeps this instance alive for resumption.
  if (event.persisted) return;
  disposed = true;
  releasePreviewSubscriptions();
  trackingLog.dispose();
  controls.dispose();
  // The SDK owns its hide/unload flush; destroying here would cancel pending final
  // durations. Browser teardown releases this document's SDK. Explicitly destroy
  // it when replacing the owner inside a still-live document instead.
});
if (!sdk.isPreview && new URL(location.href).searchParams.get('userId') === 'charles')
  identifyVisitor();
void renderRoute({ sendPage: true });

function releasePreviewSubscriptions() {
  previewSubscriptions.forEach((subscription) => subscription.unsubscribe());
  previewSubscriptions = [];
}

function bindPreview(destinations, isCurrent, failures, rendered) {
  // Fetch/render first: the source buffers its latest payload while HTTP is pending.
  // The SDK resolves updates and guards stale work; the app owns presentations/errors.
  for (const [experienceId, targets] of destinations) {
    const subscription = sdk.subscribeToPreview(experienceId, resolveOptions, ({ data, error }) => {
      if (!isCurrent()) return;
      try {
        if (data) {
          renderPresentations(data, experienceId, targets);
          rendered.add(experienceId);
          if (data.diagnostics?.length || data.deliveryDiagnostics?.length)
            failures.add(experienceId);
          else failures.delete(experienceId);
        }
        if (error) failures.add(experienceId);
      } catch {
        failures.add(experienceId);
      }
      if (failures.has(experienceId) && !rendered.has(experienceId))
        targets.forEach(({ target }) =>
          showStatus(target, 'Preview content is unavailable.', { error: true })
        );
      updatePreviewFeedback(failures);
    });
    if (!isCurrent()) {
      subscription.unsubscribe();
      return;
    }
    previewSubscriptions.push(subscription);
  }
  const subscription = sdk.states.preview.subscribe(() => {
    if (isCurrent()) updatePreviewFeedback(failures);
  });
  if (!isCurrent()) subscription.unsubscribe();
  else previewSubscriptions.push(subscription);
}

function updatePreviewFeedback(failures) {
  const panel = document.getElementById('content-error');
  panel.hidden = failures.size === 0;
  if (failures.size)
    showStatus(panel, 'Preview content could not be updated. Retry content to try again.', {
      error: true,
      retry: true,
    });
}
