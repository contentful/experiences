<script lang="ts">
  import type { ComponentErrorProps } from '@contentful/experiences-svelte';
  let { componentId, nodeId, reset }: ComponentErrorProps = $props();
</script>
<div role="alert" class="placeholder-card" data-render-error={componentId}>
  <p>Could not render {componentId}{nodeId ? ` (node ${nodeId})` : ''}.</p>
  {#if reset}<button type="button" class="btn btn--secondary btn--sm" onclick={() => reset?.()}>Try rendering again</button>{/if}
</div>
