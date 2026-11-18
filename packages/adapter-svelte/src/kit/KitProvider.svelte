<script lang="ts">
  import { untrack } from 'svelte';
  import RuntimeRoot from '../runtime/RuntimeRoot.svelte';
  import { createRuntimeOwner, type OwnerTarget } from '../runtime/owner-controller.svelte.js';
  import type { KitClientBinding, KitExperiencesProviderProps } from './client-binding.js';

  let { binding, sdk, onStatesReady, snapshot, routeKey, children }: KitExperiencesProviderProps & { binding: KitClientBinding } = $props();
  const initialTarget: OwnerTarget = untrack(() => ({ sdk, onStatesReady }));
  const owner = untrack(() => binding.getOwner(initialTarget, snapshot) ?? createRuntimeOwner(initialTarget, snapshot));
</script>

<RuntimeRoot {owner} {routeKey} {children} />
