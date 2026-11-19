<script lang="ts">
  import { page } from '$app/state';
  import ConsentPanel from '$lib/components/ConsentPanel.svelte';
  import DemoHub from '$lib/components/DemoHub.svelte';

  let { children, data } = $props();
</script>

<!-- The demo hub only shows at `/`, above the Destination's home node. -->
{#if page.url.pathname === '/'}
  <DemoHub />
{/if}
{@render children()}

{#key page.url.searchParams.get('preview_session_id')?.trim() || undefined}
<ConsentPanel
  spaceId={data.consent.spaceId}
  environmentId={data.consent.environmentId}
  accessToken={data.consent.accessToken}
  previewToken={data.consent.previewToken}
/>

{/key}
