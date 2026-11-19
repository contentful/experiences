<script lang="ts">
  import ExperiencePage from './ExperiencePage.svelte';
  import { ExperiencesRoot } from './lib/experiences.js';
  import { env } from './lib/env.js';
  import { navigation, handleLinkClick, commitLocation } from './lib/navigation.svelte.js';

  const url = $derived(navigation.url);
  const byId = $derived(/^\/experiences\/([^/]+)\/?$/.exec(url.pathname));
  const experienceId = $derived(byId ? decodeURIComponent(byId[1] ?? '') : undefined);
  const destinationPath = $derived(byId ? undefined : url.pathname);
  const locale = $derived(url.searchParams.get('locale') ?? 'en-US');
  const debug = $derived(['true', '1'].includes(url.searchParams.get('debug') ?? ''));
  // Ordinary fragments describe the page; they do not select a new Experience.
  const routeKey = $derived(url.pathname + url.search);
  const pagePayload = $derived({
    locale,
    properties: {
      title: 'Contentful Experiences',
      path: url.pathname,
      search: url.search,
      hash: url.hash,
    },
  });
</script>

<svelte:window onclick={handleLinkClick} onpopstate={commitLocation} onhashchange={commitLocation} />

<nav aria-label="Demo pages">
  <a href="/">Home</a>
  <a href="/demo/landing">Landing</a>
  <a href="/experiences/landing">By Experience id</a>
</nav>

{#if !env.spaceId || (!env.accessToken && !env.host)}
  <p role="alert">
    VITE_SPACE_ID and VITE_CDA_TOKEN (or VITE_DELIVERY_HOST for a trusted proxy) must be set. Copy
    .env.example to .env.local and fill them in.
  </p>
{:else}
  <ExperiencesRoot
    spaceId={env.spaceId}
    environmentId={env.environmentId}
    delivery={env.accessToken
      ? { accessToken: env.accessToken, host: env.host || undefined }
      : { host: env.host }}
    {routeKey}
    buildPagePayload={() => pagePayload}
  >
    <ExperiencePage {destinationPath} {experienceId} {locale} {debug} />
  </ExperiencesRoot>
{/if}
