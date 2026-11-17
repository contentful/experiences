<script lang="ts">
  import { onDestroy, onMount, untrack } from 'svelte';
  import { resolvePreviewSessionId } from '@contentful/experiences-runtime';
  import RuntimeRoot from './RuntimeRoot.svelte';
  import { createRuntimeOwner, type OwnedOwnerTarget, type RuntimeOwner } from './owner-controller.svelte.js';
  import type { RuntimeRootProps } from './types.js';

  let { target, snapshot, routeKey, children, selectOwner }: { routeKey?: string } & Omit<RuntimeRootProps, 'target' | 'owner' | 'registerTeardown'> & {
    target: OwnedOwnerTarget;
    selectOwner?: (target: OwnedOwnerTarget, snapshot?: RuntimeRootProps['snapshot']) => RuntimeOwner | undefined;
  } = $props();
  const initialTarget = untrack(() => target);
  const initialSnapshot = untrack(() => snapshot ?? {
    locale: initialTarget.config.locale,
    consent: initialTarget.config.defaults?.consent,
    persistenceConsent: initialTarget.config.defaults?.persistenceConsent,
    allowedEventTypes: initialTarget.config.allowedEventTypes,
    data: { profile: initialTarget.config.defaults?.profile, changes: initialTarget.config.defaults?.changes },
  });
  const select = (fallback: RuntimeRootProps['snapshot']) =>
    selectOwner?.(initialTarget, fallback) ?? createRuntimeOwner(fallback);
  let previousRoute = untrack(() => routeKey);
  let sessionId = untrack(() =>
    typeof window === 'undefined'
      ? undefined
      : resolvePreviewSessionId(new URLSearchParams(window.location.search))
  );
  let activation = $state.raw(untrack(() => ({ owner: select(initialSnapshot) })));
  let teardown: (() => void) | undefined;
  let mounted = $state(false);
  const registerTeardown = (callback: () => void) => {
    teardown = callback;
    return () => {
      if (teardown === callback) teardown = undefined;
    };
  };
  onMount(() => {
    mounted = true;
  });
  $effect(() => {
    if (!mounted || !initialTarget.config.preview) return;
    const nextRoute = routeKey;
    untrack(() => {
      if (nextRoute === previousRoute) return;
      previousRoute = nextRoute;
      const nextSession = resolvePreviewSessionId(new URLSearchParams(window.location.search));
      if (nextSession === sessionId) return;
      sessionId = nextSession;
      // End resources before selecting the next owner, even while DOM outros remain.
      teardown?.();
      activation = {
        owner: select({
          locale: initialSnapshot.locale,
          consent: initialSnapshot.consent,
          persistenceConsent: initialSnapshot.persistenceConsent,
          allowedEventTypes: initialSnapshot.allowedEventTypes,
        }),
      };
    });
  });
  onDestroy(() => teardown?.());
</script>

{#key activation}
  <RuntimeRoot owner={activation.owner} target={initialTarget} {registerTeardown} {children} />
{/key}
