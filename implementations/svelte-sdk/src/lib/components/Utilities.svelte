<script lang="ts">
  import { getContext } from 'svelte';
  import { page } from '$app/state';
  import { getExperiencesActions, getExperiencesState } from '@contentful/experiences-svelte';
  import { consentCookies, type ReferenceRoute } from '#lib/reference.js';
  import type { FetchExperienceOptions } from '@contentful/experiences-web';
  let { reference, status, onIntent, onReset, onRetry }: {
    reference: ReferenceRoute;
    status: string;
    onIntent: (personalization: FetchExperienceOptions['personalization'], identify?: boolean) => void;
    onReset: () => void;
    onRetry: () => void;
  } = $props();
  const sdkState = getExperiencesState();
  const actions = getExperiencesActions();
  const previewActive = $derived(__REFERENCE_ENVIRONMENT__.previewEnabled && page.url.searchParams.get('preview_session_id')?.trim());
  const label = (value: boolean | undefined) => value === undefined ? 'Undecided' : value ? 'Granted' : 'Denied';
  function consent(name: 'events' | 'persistence', value: boolean | undefined) {
    const next = value !== true;
    // This app-owned mirror lets Node read a consent decision; identity is never consent.
    document.cookie = `${consentCookies[name]}=${next ? 'granted' : 'denied'}; Path=/; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
    actions.consent({ [name]: next });
  }
  const controls = getContext<{ automatic: boolean }>('reference-controls');
  function toggleTracking() {
    controls.automatic = !controls.automatic;
  }
</script>
<section class="control-panel" aria-label="Utilities">
  <h2 class="control-panel__title">Utilities</h2>
  <div class="control-panel__fields">
    {#each [{ name: 'events' as const, title: 'Event consent', value: sdkState.consent, id: 'consent' }, { name: 'persistence' as const, title: 'Persistence consent', value: sdkState.persistenceConsent, id: 'persistence-consent' }] as item (item.name)}
      <span class="control-panel__row-label">{item.title}</span><span class="control-panel__row-value" data-testid={`${item.id}-status`}>{label(item.value)}</span>
      <span class="control-panel__row-actions"><button type="button" class="btn btn--secondary btn--sm" disabled={!sdkState.ready} data-testid={`${item.id}-button`} onclick={() => consent(item.name, item.value)}>{item.value ? 'Revoke' : 'Grant'}</button></span>
    {/each}
    <span class="control-panel__row-label">Visitor intent</span><span class="control-panel__row-value" data-testid="identified-status">URL identify intent: {(page.url.searchParams.get('userId') === 'charles') ? 'Yes' : 'No'}</span>
    <span class="control-panel__row-actions">
      <button type="button" class="btn btn--secondary btn--sm" data-testid="identify-button" disabled={!sdkState.ready || !!previewActive || (page.url.searchParams.get('userId') === 'charles') || status === 'loading'} onclick={() => onIntent({ events: [{ type: 'identify', userId: 'charles', traits: { identified: true } }] }, true)}>Identify</button>
      <button type="button" class="btn btn--secondary btn--sm" data-testid="reset-button" disabled={!sdkState.ready} onclick={onReset}>Reset</button>
    </span>
    <span class="control-panel__row-label">Content</span><span class="control-panel__row-value">{status}</span><span class="control-panel__row-actions"><button type="button" class="btn btn--secondary btn--sm" data-testid="retry-content-button" disabled={!sdkState.ready || status === 'loading'} onclick={onRetry}>Retry content</button></span>
    {#if reference.pathname.endsWith('/page-two')}
      <span class="control-panel__row-label">Custom track</span><span class="control-panel__row-value">reference_custom_action</span><span class="control-panel__row-actions"><button type="button" class="btn btn--secondary btn--sm" data-testid="track-conversion-button" disabled={!sdkState.ready || !!previewActive || status === 'loading'} onclick={() => onIntent({ events: [{ type: 'track', event: 'reference_custom_action' }] })}>CUSTOM TRACK</button></span>
    {/if}
    <span class="control-panel__row-label">Automatic tracking</span><span class="control-panel__row-value">{controls.automatic ? 'Enabled' : 'Disabled'}</span><span class="control-panel__row-actions"><button type="button" class="btn btn--secondary btn--sm" disabled={!sdkState.ready} onclick={toggleTracking}>{controls.automatic ? 'Disable' : 'Enable'} automatic</button></span>
    {#if previewActive}<span class="control-panel__row-label">Live Preview</span><span class="control-panel__row-value" role="status">{sdkState.preview?.status ?? 'Initializing'}</span><span></span>{/if}
    {#if sdkState.preview?.error}<span class="control-panel__row-label">Live Preview error</span><span class="control-panel__row-value" role="alert">Preview connection unavailable; visitor events remain suppressed.</span><span></span>{/if}
    {#if sdkState.error}<span class="control-panel__row-label">SDK error</span><span class="control-panel__row-value" role="alert">The browser SDK could not start.</span><span></span>{/if}
  </div>
  <p class="control-panel__note">Consent and persistence are separate SDK decisions. Identify/custom actions use fresh nonpage XDA intent; Retry sends no new events. Admission, profile hydration and these attempt notifications do not prove service commitment.</p>
</section>
