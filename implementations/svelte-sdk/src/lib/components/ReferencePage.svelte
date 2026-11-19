<script lang="ts">
  import { flushSync, getContext, untrack } from 'svelte';
  import { page } from '$app/state';
  import { resolve } from '$app/paths';
  import { replaceState } from '$app/navigation';
  import { fetchExperience, getExperiencesActions, getExperiencesState, isNotFoundError } from '@contentful/experiences-svelte';
  import type { FetchExperienceOptions } from '@contentful/experiences-web';
  import { request, web, comparisonClient } from '#lib/experiences.js';
  import { experienceConfig } from '#lib/experience-config.js';
  import { isPreviewRequested, referencePageTitle, routeUrl, type Comparison, type ReferenceRoute, type ReferencePath } from '#lib/reference.js';
  import ExperiencePresentation from '#lib/components/ExperiencePresentation.svelte';
  import TrackingLog from '#lib/components/TrackingLog.svelte';
  import Utilities from '#lib/components/Utilities.svelte';
  let { reference, comparisons = [] }: { reference: ReferenceRoute; comparisons?: Comparison[] } = $props();
  const sdkState = getExperiencesState();
  const actions = getExperiencesActions();
  let hidden = $state(false);
  const reveal = () => { hidden = false; };
  const current = request.useManagedExperience(() => ({ onExperienceResolved: reveal }));
  // Mode links reload the document. Only CSR has a declarative browser selection.
  if (untrack(() => reference.mode === 'csr')) {
    const claimInitialIdentify = getContext<() => boolean>('reference-initial-identify');
    let initialIdentifyRoute = untrack(() => claimInitialIdentify() ? reference.routeKey : undefined);
    web.useManagedExperience(() => {
      const { ids, routeKey, debug } = reference;
      if (routeKey !== initialIdentifyRoute) initialIdentifyRoute = undefined;
      return {
        experienceId: ids[0], debug,
        personalization: initialIdentifyRoute === undefined ? undefined : {
          events: [
            { type: 'identify', userId: 'charles', traits: { identified: true } },
            { type: 'page', properties: { title: referencePageTitle(reference) } },
          ],
        },
      };
    });
  }
  const notFound = $derived(
    current.result?.notFound ||
    (current.error?.name === 'NotFoundError' && isNotFoundError(current.error))
  );
  const settled = $derived(!!current.data || current.status === 'error');
  let route = '';
  $effect.pre(() => {
    const next = reference.routeKey;
    if (route !== next) {
      route = next;
      hidden = false;
    }
  });
  function onIntent(personalization: FetchExperienceOptions['personalization'], identify = false) {
    if (identify) {
      const url = new URL(page.url.href);
      url.searchParams.set('userId', 'charles');
      // Native shallow routing records intent without starting another Kit load.
      // eslint-disable-next-line svelte/no-navigation-without-resolve -- Kit's full current URL already includes the base path.
      replaceState(url, page.state);
    }
    void current.acquire({ personalization });
  }
  function reset() {
    // The app hides retained completed data and removes attributed DOM before SDK reset.
    flushSync(() => { hidden = true; });
    actions.reset();
    const url = new URL(page.url.href);
    url.searchParams.delete('userId');
    // eslint-disable-next-line svelte/no-navigation-without-resolve -- Kit's full current URL already includes the base path.
      replaceState(url, page.state);
  }
  const preview = $derived(isPreviewRequested(page.url.searchParams, __REFERENCE_ENVIRONMENT__.previewEnabled));
  let csrComparisons = $state.raw<Comparison[]>([]);
  $effect(() => {
    const key = reference.routeKey;
    const mode = reference.mode;
    const ready = sdkState.ready;
    if (mode !== 'csr' || !ready || !settled || preview) return;
    let active = true;
    const ids = reference.title === 'Single Experience' ? [] : [...new Set([...reference.ids.slice(1), __REFERENCE_ENVIRONMENT__.experienceIds[0]])].filter((id) => id !== reference.ids[0]);
    untrack(() => { csrComparisons = []; });
    void (async () => {
      const outcomes: Comparison[] = [];
      for (const experienceId of ids) {
        try {
          const value = await fetchExperience({
            spaceId: __REFERENCE_ENVIRONMENT__.spaceId,
            environmentId: __REFERENCE_ENVIRONMENT__.environmentId,
            experienceId, extensions: { sourceMap: {} },
          }, { client: comparisonClient }, { config: experienceConfig, debug: reference.debug });
          if (!active) return;
          outcomes.push({ experienceId, plan: value });
        } catch { if (!active) return; outcomes.push({ experienceId, error: 'Comparison content unavailable.' }); }
      }
      if (active && reference.routeKey === key) csrComparisons = outcomes;
    })();
    return () => { active = false; };
  });
  const allComparisons = $derived(reference.mode === 'csr' ? csrComparisons : comparisons);
  const primary = $derived({
    experienceId: reference.ids[0],
    plan: current.data,
    error: !current.data && current.status === 'error' ? 'Primary content unavailable.' : undefined,
  });
  const manualId = $derived(preview ? primary.experienceId : __REFERENCE_ENVIRONMENT__.experienceIds[0]);
  const manualPresentation = $derived(manualId === primary.experienceId
    ? primary
    : (allComparisons.find((item) => item.experienceId === manualId) ?? { experienceId: manualId }));
</script>
<svelte:head><title>{referencePageTitle(reference)}</title></svelte:head>
<div class="app-shell">
  <nav class="app-nav" id="app-nav" aria-label="Main navigation">
    {#each [{ path: `/${reference.mode}`, label: 'Home' }, { path: `/${reference.mode}/page-two`, label: 'Page Two' }, { path: `/${reference.mode}/single-experience`, label: 'Single Experience' }] as link (link.path)}
      <a href={resolve(routeUrl(link.path as ReferencePath, page.url))} class:active={reference.pathname === link.path} aria-current={reference.pathname === link.path ? 'page' : undefined}>{link.label}</a>
    {/each}
    {#each ['ssr', 'hybrid', 'csr'] as mode (mode)}<a href={resolve(routeUrl(`/${mode}/single-experience` as ReferencePath, page.url))} data-sveltekit-reload aria-current={reference.mode === mode ? 'page' : undefined}>{mode.toUpperCase()}</a>{/each}
  </nav>
  <div class="app-body">
    <aside class="app-sidebar" aria-label="Tracking"><TrackingLog /></aside>
    <main class="app-main" id="app-main" tabindex="-1" aria-busy={current.status === 'loading'}>
      <div class="page-header" data-testid={reference.pathname.endsWith('/page-two') ? 'page-two-view' : 'home-view'}>
        <h1>{reference.title}</h1><p class="page-header__subtitle">Standalone SvelteKit 3 reference for @contentful/experiences-svelte. Mode: {reference.mode}.</p>
      </div>
      <Utilities {reference} status={current.status} {onIntent} onReset={reset} onRetry={() => void current.retry()} />
      {#if current.error}<p role="alert" class="placeholder-card">{notFound ? 'Experience not found.' : 'Content unavailable. Applicable completed content is retained; Retry is event-free.'}</p>{/if}
      {#if current.status === 'loading'}<p role="status" class="page-loading">Loading Experience…</p>{/if}
      {#if hidden}<p role="status" class="placeholder-card">Previous visitor content is concealed. Retry or a fresh action can reveal successfully replaced content.</p>{:else}
        <div class="sections-grid sections-grid--split">
          <section class="page-section">
            <header class="page-section__header"><h2>{reference.title === 'Single Experience' ? 'Primary Experience' : 'Experiences with automatic tracking defaults'}</h2><p>Actual attributed roots use Web-owned measurement. Home/Page Two comparisons are event-free diagnostics; official support is one Experience per page.</p></header>
            <div class="entry-grid entry-grid--experiences">
              <ExperiencePresentation {...primary} />
              {#each allComparisons.filter((item) => reference.ids.includes(item.experienceId)) as item (item.experienceId)}<ExperiencePresentation {...item} />{/each}
            </div>
          </section>
          <section class="page-section">
            <header class="page-section__header"><h2>Experiences for manual view measurement</h2><p>The same plan is reused with independent DOM roots. Automatic kinds are suppressed on those roots; Web measures views through the manual container marker. No event buttons simulate interactions.</p></header>
            <div class="entry-grid entry-grid--experiences">
              <ExperiencePresentation {...manualPresentation} manual />
              <ExperiencePresentation {...manualPresentation} manual repeated />
            </div>
          </section>
        </div>
      {/if}
      {#if preview}<p class="control-panel__note">Preview comparisons are omitted: ordinary Delivery diagnostics cannot stand in for session content. Live Preview service verification is deployment-gated and deferred.</p>{/if}
    </main>
  </div>
</div>
