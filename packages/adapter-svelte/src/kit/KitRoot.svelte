<script lang="ts">
  import OwnedActivationBoundary from '../runtime/OwnedActivationBoundary.svelte';
  import type { KitClientBinding, KitExperiencesRootProps } from './client-binding.js';

  let { binding, snapshot, routeKey, children }: KitExperiencesRootProps & { binding: KitClientBinding } = $props();

</script>

<OwnedActivationBoundary selectOwner={binding.selectOwnedOwner} target={binding.target} {snapshot} {routeKey} {children} />
