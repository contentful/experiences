<script lang="ts">
  import OwnedActivationBoundary from '../runtime/OwnedActivationBoundary.svelte';
  import KitProvider from './KitProvider.svelte';
  import type { KitClientBinding, KitExperiencesRootProps } from './client-binding.js';

  let { binding, snapshot, routeKey, children }: KitExperiencesRootProps & { binding: KitClientBinding } = $props();

</script>

{#if 'config' in binding.target}
  <OwnedActivationBoundary selectOwner={binding.selectOwnedOwner} target={binding.target} {snapshot} {routeKey} {children} />
{:else}
  <KitProvider {binding} sdk={binding.target.sdk} onStatesReady={binding.target.onStatesReady} {snapshot} {routeKey} {children} />
{/if}
