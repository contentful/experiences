<script lang="ts">
  import { page } from '$app/state';
  import ConsentPanel from '$lib/components/ConsentPanel.svelte';
  import DemoHub from '$lib/components/DemoHub.svelte';
  import { request } from '$lib/experiences.js';

  const { ExperiencesRoot } = request;
  let { children } = $props();
</script>

<ExperiencesRoot source={page.data.primarySource}>
  <!-- The demo hub only shows at `/`, above the Destination's home node. -->
  {#if page.url.pathname === '/'}
    <DemoHub />
  {/if}
  {@render children()}

  <ConsentPanel />
</ExperiencesRoot>
