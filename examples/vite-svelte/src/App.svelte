<!--
  Two routes: `/` and `/:experienceId`. Read straight off `location` so the
  example has no router dependency; swap in a router in a real app; nothing
  SDK-related changes. Vite's dev and preview servers fall back to
  `index.html` for unknown paths, so deep links work.
-->
<script lang="ts">
  import ExperiencePage from './ExperiencePage.svelte';
  import HomePage from './HomePage.svelte';

  const experienceId = decodeURIComponent(window.location.pathname.slice(1).split('/')[0] ?? '');
  const query = new URLSearchParams(window.location.search);
  const locale = query.get('locale') ?? 'en-US';
  const debug = query.get('debug') === 'true' || query.get('debug') === '1';
</script>

{#if experienceId}
  <ExperiencePage {experienceId} {locale} {debug} />
{:else}
  <HomePage />
{/if}
