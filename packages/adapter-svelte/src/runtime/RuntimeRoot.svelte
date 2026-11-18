<script lang="ts">
  import { onDestroy, onMount, untrack } from 'svelte';
  import { setRuntimeScope } from './context.svelte.js';
  import type { RuntimeRootProps } from './types.js';

  let {
    owner, registerTeardown, children,
    routeKey, initialPagePayload, buildPagePayload, handoff,
  }: RuntimeRootProps = $props();
  const scope = setRuntimeScope(untrack(() => owner));
  const routeOptions = () => ({
    routeKey: routeKey ?? (typeof window === 'undefined'
      ? '/'
      : window.location.pathname + window.location.search),
    initialPagePayload, buildPagePayload, handoff,
  });
  untrack(() => scope.route.update(routeOptions()));
  const unregister = untrack(() => registerTeardown?.(scope.dispose));

  onMount(() => { owner.activate(); });
  $effect.pre(() => {
    // Payload options stay live without becoming route identity.
    owner.current;
    const options = routeOptions();
    untrack(() => scope.route.update(options));
  });

  onDestroy(() => unregister?.());
</script>

{@render children?.()}
