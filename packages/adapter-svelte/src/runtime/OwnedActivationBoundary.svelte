<script lang="ts">
  import { onDestroy, untrack } from 'svelte';
  import { resolvePreviewSessionId } from '@contentful/experiences-runtime';
  import RuntimeRoot from './RuntimeRoot.svelte';
  import { createRuntimeOwner, type OwnedOwnerTarget, type RuntimeOwner } from './owner-controller.svelte.js';
  import type { ExperiencesSnapshot } from '@contentful/experiences-web';
  import type { RuntimeRootProps } from './types.js';

  let { target, snapshot, routeKey, initialPagePayload, buildPagePayload, handoff, children, selectOwner }: Omit<RuntimeRootProps, 'owner' | 'registerTeardown'> & { snapshot?: ExperiencesSnapshot } & {
    target: OwnedOwnerTarget;
    selectOwner?: (target: OwnedOwnerTarget, snapshot?: ExperiencesSnapshot) => RuntimeOwner | undefined;
  } = $props();
  const initialTarget = untrack(() => target);
  const initialSnapshot = untrack(() => snapshot ?? {
    locale: initialTarget.config.locale,
    consent: initialTarget.config.defaults?.consent,
    persistenceConsent: initialTarget.config.defaults?.persistenceConsent,
    allowedEventTypes: initialTarget.config.allowedEventTypes,
    data: { profile: initialTarget.config.defaults?.profile, changes: initialTarget.config.defaults?.changes },
  });
  const select = (fallback: ExperiencesSnapshot) =>
    selectOwner?.(initialTarget, fallback) ?? createRuntimeOwner(initialTarget, fallback);
  let owner = $state.raw(untrack(() => select(initialSnapshot)));
  let teardown: (() => void) | undefined;
  const registerTeardown = (callback: () => void) => {
    teardown = callback;
    return () => {
      if (teardown === callback) teardown = undefined;
    };
  };
  $effect(() => {
    if (!initialTarget.config.preview) return;
    routeKey;
    untrack(() => {
      const nextSession = resolvePreviewSessionId(new URLSearchParams(window.location.search));
      if (nextSession === owner.sessionId) return;
      // End resources before selecting the next owner, even while DOM outros remain.
      teardown?.();
      owner = select({
          locale: initialSnapshot.locale,
          consent: initialSnapshot.consent,
          persistenceConsent: initialSnapshot.persistenceConsent,
          allowedEventTypes: initialSnapshot.allowedEventTypes,
        });
    });
  });
  onDestroy(() => teardown?.());
</script>

{#key owner}
  <RuntimeRoot {owner} {registerTeardown} {routeKey} {initialPagePayload} {buildPagePayload} {handoff} {children} />
{/key}
