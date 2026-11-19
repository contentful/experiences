<script lang="ts">
  import { setContext } from 'svelte';
  import { page } from '$app/state';
  import TrackingSettings from '#lib/components/TrackingSettings.svelte';
  import { createInitialIdentifyClaim, referencePageTitle } from '#lib/reference.js';
  import { request } from '#lib/experiences.js';
  import '#lib/theme.css';
  let { children } = $props();
  const { ExperiencesRoot } = request;
  const controls = $state({ automatic: true });
  setContext('reference-controls', controls);
  setContext('reference-initial-identify', createInitialIdentifyClaim(() =>
    page.data.reference?.initialIdentify === true
  ));
  function buildPagePayload() {
    const reference = page.data.reference;
    if (reference?.mode === 'csr') return { properties: { title: referencePageTitle(reference) } };
  }
</script>
{#if __REFERENCE_ENVIRONMENT__.configurationError || page.data.configurationError}
  <main class="app-main"><h1>Svelte SDK reference</h1><p role="alert" class="placeholder-card">{page.data.configurationError ?? __REFERENCE_ENVIRONMENT__.configurationError}</p><p>The server health endpoint remains available without credentials.</p></main>
{:else}
  <ExperiencesRoot source={page.data.primarySource} routeKey={page.data.reference?.routeKey} {buildPagePayload}>
    <TrackingSettings />
    {@render children()}
  </ExperiencesRoot>
{/if}
