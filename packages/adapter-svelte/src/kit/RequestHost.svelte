<script lang="ts">
  import { onDestroy, untrack } from 'svelte';
  import { goto } from '$app/navigation';
  import { useNativeNavigation } from './native-navigation.svelte.js';
  import OwnedActivationBoundary from '../runtime/OwnedActivationBoundary.svelte';
  import RuntimeRoot from '../runtime/RuntimeRoot.svelte';
  import RequestActivation from './RequestActivation.svelte';
  import { getRequestSourceState } from './request-source.js';
  import { createRuntimeOwner, type OwnerTarget, type OwnedOwnerTarget } from '../runtime/owner-controller.svelte.js';
  import type { ExperiencesSnapshot } from '@contentful/experiences-web';
  import type { KitClientBinding, KitExperiencesRootProps } from './client-binding.js';
  let { binding, target, source, snapshot, routeKey, buildPagePayload, children }: KitExperiencesRootProps & {
    binding: KitClientBinding;
    target: OwnerTarget;
  } = $props();
  const controller = untrack(() => binding.createController(goto));
  const owner = untrack(() => 'sdk' in target
    ? binding.getOwner(target, snapshot) ?? createRuntimeOwner(target, snapshot)
    : undefined);
  const selectOwner = (target: OwnedOwnerTarget, snapshot?: ExperiencesSnapshot) => {
    const preview = source && getRequestSourceState(source).result?.preview;
    const overrides = Object.fromEntries(Object.entries(preview ?? {}).filter(([, value]) => value !== undefined));
    return binding.selectOwnedOwner(target.config.preview ? {
      ...target, config: { ...target.config, preview: { ...target.config.preview, ...overrides } },
    } : target, snapshot);
  };
  untrack(() => controller.seed(source));
  const native = untrack(() => useNativeNavigation(() => routeKey));
  onDestroy(() => controller.dispose());
</script>
{#snippet content()}
  <RequestActivation {controller} {source} routeKey={native.routeKey} />
  {@render children?.()}
{/snippet}
{#if 'config' in target}
  <OwnedActivationBoundary presentation={controller.presentation} {selectOwner} target={target} {snapshot} routeKey={native.routeKey} {buildPagePayload} children={content} />
{:else if owner}
  <RuntimeRoot presentation={controller.presentation} {owner} routeKey={native.routeKey} {buildPagePayload} children={content} />
{/if}
