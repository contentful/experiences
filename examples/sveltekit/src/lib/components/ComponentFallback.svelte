<script lang="ts">
  import type { ComponentErrorProps } from '@contentful/experiences-svelte';
  let { reset }: ComponentErrorProps = $props();
</script>

<div role="status">
  <p>This component could not be displayed.</p>
  {#if reset}
    <button type="button" onclick={() => reset?.()}>Try rendering again</button>
  {/if}
</div>
