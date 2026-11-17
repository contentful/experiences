<script lang="ts">
  import { onDestroy, onMount, untrack } from 'svelte';
  import { createRuntimeOwner } from './owner-controller.svelte.js';
  import { setRuntimeScope } from './context.svelte.js';
  import type { RuntimeRootProps } from './types.js';

  let { target, owner: suppliedOwner, snapshot, registerTeardown, rebindInjected, children }: RuntimeRootProps = $props();
  const initialTarget = untrack(() => target);
  const owner = untrack(() => suppliedOwner ?? createRuntimeOwner(snapshot));
  const scope = setRuntimeScope(owner);
  let mounted = $state(false);
  let disposed = false;
  const teardown = () => {
    if (disposed) return;
    disposed = true;
    try {
      scope.dispose();
    } finally {
      owner.dispose();
    }
  };
  const unregister = untrack(() => registerTeardown?.(teardown));

  onMount(() => {
    owner.activate(initialTarget);
    mounted = true;
  });

  $effect(() => {
    if (!mounted || !('sdk' in initialTarget) || !('sdk' in target)) return;
    const nextSdk = target.sdk;
    untrack(() => {
      (rebindInjected ?? owner.rebindInjected)({
        sdk: nextSdk,
        onStatesReady: initialTarget.onStatesReady,
      });
    });
  });

  onDestroy(() => {
    try {
      teardown();
    } finally {
      unregister?.();
    }
  });
</script>

{@render children?.()}
