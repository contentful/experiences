<script lang="ts">
  import ConsentPanel from '$lib/components/ConsentPanel.svelte';
  import PersonalizationToggle from '$lib/components/PersonalizationToggle.svelte';

  let { children, data } = $props();
</script>

<PersonalizationToggle />
{@render children()}

<ConsentPanel
  spaceId={data.consent.spaceId}
  environmentId={data.consent.environmentId}
  accessToken={data.consent.accessToken}
/>
