import { createPreviewInitializer, getPreviewBinding } from '/dist/preview.js';
import { createRoutes, pageContext } from '/dist/shared.js';
import { createControlPanel } from './control-panel.js';
import { renderExperience } from './experiences.js';
import { cloneTemplate } from './templates.js';
import { createTrackingLog } from './tracking.js';

const appMain = document.getElementById('app-main');
const status = document.getElementById('browser-status');
let sdk;
let controls;
let trackingLog;
let disposed = false;
let manualElements = [];
let previewSubscriptions = [];
let routes;
let environment;
let previewBinding;
const resolveOptions = { config: { components: {}, experienceTemplates: {} } };
let generation = 0;
let pageGeneration = 0;
let pagePending = false;
let pageFailed = false;
// Node owns startup's committed page. This promise is deliberately already settled.
let pendingPage = Promise.resolve();
let disposeRouteAction = () => {};

window.addEventListener('pagehide', (event) => {
  if (event.persisted) return;
  disposed = true;
  generation += 1;
  releasePreviewSubscriptions();
  pageGeneration += 1;
  document.removeEventListener('click', onDocumentClick);
  window.removeEventListener('popstate', onPopState);
  disposeRouteAction();
  controls?.dispose();
  trackingLog?.dispose();
  // Consumer integration: the SDK owns hide/unload final measurements and flush.
  // Do not destroy it during document exit and cancel its pending final events.
  // A BFCache suspension retains this document's instance and subscriptions.
});

async function activate() {
  try {
    const bootstrap = JSON.parse(document.getElementById('experience-bootstrap').textContent);
    environment = bootstrap.environment;
    const { handoff, preview } = bootstrap;
    previewBinding = preview?.binding;
    routes = createRoutes(environment.EXPERIENCE_IDS);
    // Consumer integration: one Web runtime discovers existing SSR attribution
    // and later DOM changes. Tracking uses SDK consent and current identity.
    sdk = new window.ContentfulExperiences({
      spaceId: environment.SPACE_ID,
      environmentId: environment.ENVIRONMENT_ID,
      locale: environment.LOCALE,
      delivery: { accessToken: environment.CDA_TOKEN },
      preview: environment.LIVE_PREVIEW
        ? { accessToken: environment.LIVE_PREVIEW.accessToken, host: environment.LIVE_PREVIEW.host }
        : undefined,
      livePreview: createPreviewInitializer(previewBinding),
      ...(preview && !previewBinding ? { isPreview: true } : {}),
      cookie: { path: '/', sameSite: 'lax', secure: location.protocol === 'https:', expires: 365 },
    });
    // Maintainer: optional browser-attempt diagnostics; never synthesize Node's
    // already-committed events. Observing does not gate SDK tracking.
    trackingLog = createTrackingLog(sdk);
    controls = createControlPanel(sdk, {
      onIdentify,
      onReset,
      onRetry: () => void renderRoute(),
    });
    for (const element of appMain.querySelectorAll('[data-reference-view-attribution]')) {
      const data = JSON.parse(element.getAttribute('data-reference-view-attribution'));
      // Consumer integration: manual roots use real data independently of
      // automatic attributes and hydration. The SDK owns measurement and delivery.
      sdk.tracking.enableElement('views', element, { data });
      manualElements.push(element);
    }
    status.textContent = sdk.isPreview
      ? 'Connecting preview; server content retained…'
      : 'Adopting server profile…';
    // The server already committed its page and selected content. State-only
    // hydration neither gates tracking nor replaces HTML and sends no browser page.
    if (sdk.isPreview) {
      // Retain the server presentations; attach only for new preview plans.
      // Serialized plans establish content/error state without a startup fetch.
      const destinations = new Map();
      for (const section of ['auto', 'manual']) {
        for (const target of appMain.querySelectorAll(
          `[data-experiences="${section}"] [data-experience-presentation]`
        )) {
          const experienceId = target.dataset.experiencePresentation;
          if (!destinations.has(experienceId)) destinations.set(experienceId, []);
          destinations.get(experienceId).push({ section, target });
        }
      }
      await loadExperiences(destinations, false, undefined, () => !disposed, preview.initialPlans);
    } else {
      await sdk.hydrateHandoffState(handoff, { routeKey: location.pathname + location.search });
    }
    if (disposed) return;

    controls.activate();
    updateNavigation();
    wireRouteAction();
    document.addEventListener('click', onDocumentClick);
    window.addEventListener('popstate', onPopState);
    if (!sdk.isPreview) status.textContent = 'Browser active. Server-rendered content retained.';
  } catch {
    releasePreviewSubscriptions();
    controls?.dispose();
    trackingLog?.dispose();
    if (disposed) return;
    // Failure leaves actual server content and ordinary links usable. Stop any
    // partial registration/SDK ownership; never compensate with a page or fetch.
    for (const element of manualElements) sdk.tracking.clearElement('views', element);
    sdk?.destroy();
    status.setAttribute('role', 'alert');
    status.textContent = 'Browser activation failed. Server-rendered content remains available.';
  }
}

void activate();

function routeUrl(path) {
  const url = new URL(path, location.origin);
  const current = new URL(location.href);
  for (const key of ['preview_session_id', 'preview_experience_id']) {
    if (!url.searchParams.has(key) && current.searchParams.has(key))
      url.searchParams.set(key, current.searchParams.get(key));
  }
  if (new URL(location.href).searchParams.get('userId') === 'charles') {
    url.searchParams.set('userId', 'charles');
  } else url.searchParams.delete('userId');
  return url.pathname + url.search;
}

function updateNavigation() {
  for (const link of document.querySelectorAll('#app-nav a')) {
    const path = new URL(link.href).pathname;
    link.dataset.routeHref ??= link.getAttribute('href');
    link.href = routeUrl(link.dataset.routeHref);
    const active = path === location.pathname;
    link.classList.toggle('active', active);
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  document.title = `${routes[location.pathname]?.title ?? 'Page not found'} – Contentful Experiences Node + Web SDK`;
  controls.refresh();
}

function onIdentify() {
  // Reference app: URL identity is intent, not an API profile or authentication.
  const url = new URL(location.href);
  url.searchParams.set('userId', 'charles');
  history.replaceState(null, '', url.pathname + url.search);
  void renderRoute();
}

function onReset() {
  const url = new URL(location.href);
  url.searchParams.delete('userId');
  history.replaceState(null, '', url.pathname + url.search);
  void renderRoute({ sendPage: true, reset: true, focus: true });
}

function onDocumentClick(event) {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  )
    return;
  const link = event.target.closest?.('a[href]');
  if (!link || link.hasAttribute('download') || (link.target && link.target !== '_self')) return;
  const url = new URL(link.href);
  if (url.origin !== location.origin || url.hash || !Object.hasOwn(routes, url.pathname)) return;
  event.preventDefault();
  history.pushState(null, '', routeUrl(url.pathname + url.search));
  void renderRoute({ sendPage: true, focus: true });
}

function onPopState() {
  void renderRoute({ sendPage: true, focus: true });
}

function showStatus(target, message, { error = false, retry = false } = {}) {
  const content = cloneTemplate('status');
  const text = content.querySelector('p');
  text.setAttribute('role', error ? 'alert' : 'status');
  text.textContent = message;
  const button = content.querySelector('button');
  if (retry) {
    button.hidden = false;
    button.addEventListener('click', () => void renderRoute());
  } else button.remove();
  target.replaceChildren(content);
}

function renderRouteShell(route, focus) {
  disposeRouteAction();
  disposeRouteAction = () => {};
  const header = cloneTemplate('route-header');
  header.querySelector('header').dataset.testid =
    location.pathname === '/' ? 'home-view' : 'page-two-view';
  header.querySelector('h1').textContent = route?.title ?? 'Page not found';
  // Consumer integration: removing attributed content ends old presentations.
  // Reset calls SDK.reset only AFTER this synchronous replacement.
  document.getElementById('route-header').replaceChildren(header);
  const content = document.getElementById('route-content');
  content.replaceChildren();
  appMain.querySelector('[data-custom-action]').hidden = location.pathname !== '/page-two';
  if (route) {
    content.appendChild(cloneTemplate('content'));
  }
  appMain.scrollTop = 0;
  appMain.removeAttribute('aria-busy');
  updateNavigation();
  if (focus) appMain.focus();
}

function createDestinations(route) {
  const destinations = new Map();
  for (const section of ['auto', 'manual']) {
    const parent = appMain.querySelector(`[data-experiences="${section}"]`);
    for (const id of section === 'auto' ? route.automatic : route.manual) {
      const target = document.createElement('div');
      showStatus(target, 'Loading Experience content…');
      parent.appendChild(target);
      if (!destinations.has(id)) destinations.set(id, []);
      destinations.get(id).push({ section, target });
    }
  }
  return destinations;
}

// Reference app: content actions invalidate renders independently of page ownership.
// Identify/Retry join a pending navigation page; they do not add another page.
async function renderRoute({ sendPage = false, reset = false, focus = false } = {}) {
  const nextBinding = getPreviewBinding(environment, location.href);
  const nextIsPreview = Boolean(
    nextBinding || new URL(location.href).searchParams.get('preview_session_id')?.trim()
  );
  if (nextIsPreview !== sdk.isPreview) {
    location.reload();
    return;
  }
  const current = ++generation;
  releasePreviewSubscriptions();
  const isCurrent = () => !disposed && generation === current;
  const route = routes[location.pathname];
  const page = pageContext(new URL(location.href), document.referrer);
  const identifyRequested = new URL(location.href).searchParams.get('userId') === 'charles';
  const previousManual = manualElements;
  manualElements = [];
  renderRouteShell(route, focus);
  if (reset) {
    // SDK reset resumes discovery immediately and invalidates its old responses.
    // Detach from obsolete page work so a previous visitor cannot delay this one.
    pageGeneration += 1;
    pendingPage = Promise.resolve();
    pagePending = false;
    pageFailed = false;
    sdk.reset();
  }
  await Promise.resolve();
  // Let ordinary DOM removal finalize SDK measurements before clearing overrides.
  // Reset already discarded the old measurements and manual overrides.
  if (!reset) previousManual.forEach((element) => sdk.tracking.clearElement('views', element));
  if (!isCurrent() || !route) return;
  wireRouteAction();
  const destinations = createDestinations(route);
  const errorPanel = document.getElementById('content-error');
  appMain.setAttribute('aria-busy', 'true');
  status.textContent = 'Updating content…';
  try {
    if (sdk.isPreview) {
      if (nextBinding && JSON.stringify(nextBinding) !== JSON.stringify(previewBinding)) {
        await sdk.replaceLivePreview(createPreviewInitializer(nextBinding));
        if (!isCurrent()) return;
        previewBinding = nextBinding;
      }
    } else {
      await initializeVisitor(sendPage, page, isCurrent);
      if (!isCurrent()) return;
    }
    const failed = await loadExperiences(destinations, identifyRequested, page, isCurrent);
    if (!isCurrent()) return;
    if (failed && !sdk.isPreview) {
      errorPanel.hidden = false;
      showStatus(errorPanel, 'Some Experience content is unavailable.', {
        error: true,
        retry: true,
      });
    }
    appMain.removeAttribute('aria-busy');
    if (!sdk.isPreview)
      status.textContent = failed
        ? 'Some content could not be loaded.'
        : 'Browser active. Content updated.';
  } catch {
    if (!isCurrent()) return;
    appMain.removeAttribute('aria-busy');
    errorPanel.hidden = false;
    showStatus(
      errorPanel,
      sdk.isPreview
        ? 'Preview content could not be loaded. Check the session and retry.'
        : 'A visitor profile could not be established. Check your connection and retry.',
      { error: true, retry: true }
    );
    for (const targets of destinations.values())
      targets.forEach(({ target }) =>
        showStatus(
          target,
          sdk.isPreview
            ? 'Preview content is unavailable. Retry content to try again.'
            : 'Content is unavailable until visitor initialization succeeds.'
        )
      );
    status.textContent = sdk.isPreview
      ? 'Preview initialization failed. Retry content to try again.'
      : 'Visitor initialization failed. Retry content to try again.';
  }
}

// XDA workaround: the standalone page, pre-fetch profile prerequisite and
// page-specific recovery jointly compensate for initial identify-bearing XDA timeouts.
// Reassess them together when the first event-bearing fetch can establish identity
// and select the expected variant (README); retain route ownership/lifetime checks.
async function initializeVisitor(sendPage, page, isCurrent) {
  if (sendPage || (!pagePending && (pageFailed || !sdk.states.profile.current?.id))) {
    const request = ++pageGeneration;
    const properties = { url: page.url, title: document.title };
    pagePending = true;
    pageFailed = false;
    pendingPage = pendingPage
      .catch(() => {})
      .then(async () => {
        if (disposed || request !== pageGeneration) return;
        try {
          // XDA workaround: page first establishes SDK-owned identity. Never attach
          // this committed page to XDA or infer success from queued admission alone.
          const result = await sdk.page({ page, properties });
          if (disposed || request !== pageGeneration) return;
          if (!result.accepted || !sdk.states.profile.current?.id)
            throw new Error('Page did not establish a profile.');
        } catch (error) {
          if (!disposed && request === pageGeneration) pageFailed = true;
          throw error;
        } finally {
          if (request === pageGeneration) pagePending = false;
        }
      });
  }
  await pendingPage;
  if (isCurrent() && !sdk.states.profile.current?.id)
    throw new Error('Visitor profile is not available.');
}

async function loadExperiences(destinations, identifyRequested, page, isCurrent, initialPlans) {
  const identify =
    !sdk.isPreview && identifyRequested
      ? sdk.eventBuilder.buildIdentify({
          userId: 'charles',
          traits: { identified: true },
          page,
          locale: environment.LOCALE,
          userAgent: window.navigator.userAgent,
        })
      : undefined;
  const failures = new Set();
  const rendered = new Set();
  // Repeated identify makes these requests potentially profile-producing; later
  // fetches can depend on earlier SDK profile updates. Reassess serialization when
  // repeated identify is removed, retaining only actual dependencies (README).
  for (const [experienceId, targets] of destinations) {
    if (!isCurrent()) return;
    try {
      const plan =
        initialPlans === undefined
          ? await sdk.fetchExperience(
              {
                experienceId,
                ...(previewBinding?.experienceId === experienceId
                  ? {}
                  : { extensions: { sourceMap: {} } }),
                // XDA workaround: profile-only requests can select baseline. Reuse one
                // identify for the cycle, but never independently submit it or the page.
                ...(identify ? { personalization: { events: [identify] } } : {}),
              },
              resolveOptions
            )
          : initialPlans[experienceId];
      if (!plan) throw new Error('Initial preview content is unavailable.');
      if (!isCurrent()) return;
      if (initialPlans === undefined) renderPresentations(plan, experienceId, targets);
      rendered.add(experienceId);
      if (sdk.isPreview && (plan.diagnostics?.length || plan.deliveryDiagnostics?.length))
        failures.add(experienceId);
    } catch (error) {
      if (!isCurrent()) return;
      failures.add(experienceId);
      const message =
        error?.statusCode === 404
          ? 'This Experience was not found.'
          : 'This Experience could not be loaded or rendered.';
      if (initialPlans === undefined)
        targets.forEach(({ target }) => showStatus(target, message, { error: true }));
    }
  }
  if (sdk.isPreview && isCurrent()) bindPreview(destinations, isCurrent, failures, rendered);
  return failures.size > 0;
}

function wireRouteAction() {
  disposeRouteAction();
  const actions = appMain.querySelector('[data-custom-action]');
  if (!actions || actions.hidden) {
    disposeRouteAction = () => {};
    return;
  }
  const button = actions.querySelector('button');
  const feedback = actions.querySelector('[role="status"]');
  feedback.textContent = '';
  const current = generation;
  const isCurrent = () => !disposed && current === generation;
  button.disabled = false;
  const onClick = async () => {
    button.disabled = true;
    feedback.textContent = 'Submitting custom action…';
    try {
      await pendingPage;
      if (!isCurrent()) return;
      const result = await sdk.track({ event: 'reference_custom_action' });
      if (!isCurrent()) return;
      feedback.textContent = result.accepted
        ? 'Custom event admitted; delivery unconfirmed.'
        : 'Custom event not admitted.';
    } catch {
      if (isCurrent()) feedback.textContent = 'Unable to record the custom action.';
    } finally {
      if (isCurrent()) button.disabled = false;
    }
  };
  button.addEventListener('click', onClick);
  disposeRouteAction = () => button.removeEventListener('click', onClick);
}

function renderPresentations(plan, experienceId, targets) {
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
  for (const { element, data } of manualRoots) {
    sdk.tracking.enableElement('views', element, { data });
    manualElements.push(element);
  }
}

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
  status.textContent = failures.size
    ? 'Preview content update failed. Usable content retained.'
    : sdk.states.preview.current?.status === 'live'
      ? 'Preview connected. Content available.'
      : 'Preview mode active. Content available.';
}
