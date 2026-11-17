<script lang="ts">
  import { untrack } from 'svelte';
  import RuntimeRoot from '../runtime/RuntimeRoot.svelte';
  import type { OwnerTarget } from '../runtime/owner-controller.svelte.js';
  import type { KitClientBinding, KitExperiencesProviderProps } from './client-binding.js';

  let { binding, sdk, onStatesReady, snapshot, children }: KitExperiencesProviderProps & { binding: KitClientBinding } = $props();
  const initialTarget: OwnerTarget = untrack(() => ({ sdk, onStatesReady }));
  const owner = untrack(() => binding.getOwner(initialTarget, snapshot));
</script>

<RuntimeRoot {owner} target={{ sdk, onStatesReady }} rebindInjected={binding.rebindInjected} {snapshot} {children} />
