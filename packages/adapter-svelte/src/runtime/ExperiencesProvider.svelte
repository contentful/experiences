<script lang="ts">
  import RuntimeRoot from './RuntimeRoot.svelte';
  import type { ExperiencesProviderProps } from './types.js';

  let { sdk, children, snapshot, onStatesReady }: ExperiencesProviderProps = $props();
</script>

<RuntimeRoot target={{ sdk, onStatesReady }} {snapshot} {children} />
