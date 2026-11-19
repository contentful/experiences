<script lang="ts">
  import type { MissingComponentProps } from '@contentful/experiences-svelte';
  let { componentId, nodeId }: MissingComponentProps = $props();
</script>
<p role="alert" class="placeholder-card">No component registered for {componentId}{nodeId ? ` (node ${nodeId})` : ''}.</p>
