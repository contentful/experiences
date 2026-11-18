<script lang="ts">
  import { untrack } from 'svelte';
  import RequestHost from './RequestHost.svelte';
  import type { KitClientBinding, KitExperiencesProviderProps } from './client-binding.js';
  let { binding, sdk, onStatesReady, ...props }: KitExperiencesProviderProps & { binding: KitClientBinding } = $props();
  const target = untrack(() => ({ sdk, onStatesReady }));
</script>
<RequestHost {binding} {target} {...props} />
