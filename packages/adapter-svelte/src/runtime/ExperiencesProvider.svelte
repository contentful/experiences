<script lang="ts">
  import { untrack } from 'svelte';
  import { createRuntimeOwner } from './owner-controller.svelte.js';
  import RuntimeRoot from './RuntimeRoot.svelte';
  import type { ExperiencesProviderProps } from './types.js';

  let { sdk, children, snapshot, routeKey, initialPagePayload, buildPagePayload, handoff, onStatesReady }: ExperiencesProviderProps = $props();
  const owner = untrack(() => createRuntimeOwner({ sdk, onStatesReady }, snapshot));
</script>

<RuntimeRoot {owner} {routeKey} {initialPagePayload} {buildPagePayload} {handoff} {children} />
