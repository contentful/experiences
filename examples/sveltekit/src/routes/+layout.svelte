<script lang="ts">
  import ConsentPanel from '$lib/components/ConsentPanel.svelte';

  let { children, data } = $props();
</script>

{@render children()}

<ConsentPanel
  spaceId={data.consent.spaceId}
  environmentId={data.consent.environmentId}
  accessToken={data.consent.accessToken}
/>
