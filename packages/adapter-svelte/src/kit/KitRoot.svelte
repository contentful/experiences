<script lang="ts">
  import { untrack } from 'svelte';
  import RequestHost from './RequestHost.svelte';
  import type { KitClientBinding, KitExperiencesRootProps } from './client-binding.js';
  let { binding, ...props }: KitExperiencesRootProps & { binding: KitClientBinding } = $props();
  const target = untrack(() => binding.target);
</script>
<RequestHost {binding} {target} {...props} />
