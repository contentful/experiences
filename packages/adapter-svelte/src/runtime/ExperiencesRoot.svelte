<script lang="ts">
  import { untrack } from 'svelte';
  import OwnedActivationBoundary from './OwnedActivationBoundary.svelte';
  import type { ExperiencesRootProps } from './types.js';

  let { children, snapshot, routeKey, initialPagePayload, buildPagePayload, handoff, onStatesReady, ...config }: ExperiencesRootProps = $props();
  const target = untrack(() => ({ config: { ...config }, onStatesReady }));
</script>

<OwnedActivationBoundary {target} {snapshot} {routeKey} {initialPagePayload} {buildPagePayload} {handoff} {children} />
