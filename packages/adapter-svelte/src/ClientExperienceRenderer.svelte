<!--
 * Client Experience renderer. First paint matches the server renderer
 * (active viewport resolved from `initialViewportId`); after hydration,
 * `useActiveViewport` takes over via `window.matchMedia` and re-renders
 * when the viewport changes.
 *
 * Safe to render on the server: `useActiveViewport` no-ops outside the
 * browser, so SSR matches `<ServerExperienceRenderer>` byte-for-byte (given
 * the same seed). Hydration picks up the live matcher transparently.
-->
<script lang="ts">
  import type { ExperienceContext, ViewportDef } from '@contentful/experiences-core';

  import MissingComponent from './MissingComponent.svelte';
  import NodesRenderer from './NodesRenderer.svelte';
  import WrapWithTemplate from './WrapWithTemplate.svelte';
  import type { ClientExperienceRendererProps } from './component-props.js';
  import { setExperience } from './context.js';
  import type { RenderContext } from './types.js';
  import { useActiveViewport } from './use-active-viewport.svelte.js';

  const DEFAULT_CONTEXT: ExperienceContext = {
    isPreview: false,
    metadata: {},
    viewports: [],
  };

  const FALLBACK_VIEWPORT: ViewportDef = {
    id: '_',
    query: '*',
    displayName: 'Default',
    previewSize: '100%',
  };

  let {
    experience,
    config,
    initialViewportId,
    context,
    renderUnknown = MissingComponent,
  }: ClientExperienceRendererProps = $props();

  const viewports = $derived(experience?.viewports ?? []);
  const tracker = useActiveViewport(viewports, initialViewportId);

  // A $state-backed mirror so descendants reading getExperience() stay
  // reactive across viewport changes. The fields update in an $effect below.
  const liveContext = $state<RenderContext>({
    ...DEFAULT_CONTEXT,
    ...context,
    metadata: { ...DEFAULT_CONTEXT.metadata, ...(context?.metadata ?? {}) },
    viewports: experience?.viewports ?? [],
    activeViewport: experience?.viewports[0] ?? FALLBACK_VIEWPORT,
    activeViewportIndex: 0,
  });

  setExperience(liveContext);

  $effect(() => {
    if (!experience) return;
    const idx = tracker.activeViewportIndex;
    liveContext.viewports = experience.viewports;
    liveContext.activeViewport = experience.viewports[idx] ?? FALLBACK_VIEWPORT;
    liveContext.activeViewportIndex = idx;
    liveContext.isPreview = context?.isPreview ?? false;
    liveContext.metadata = { ...DEFAULT_CONTEXT.metadata, ...(context?.metadata ?? {}) };
  });
</script>

{#if experience}
  <WrapWithTemplate template={experience.template} {config} experience={liveContext}>
    {#snippet children()}
      <NodesRenderer
        nodes={experience.nodes}
        {config}
        experience={liveContext}
        {renderUnknown}
      />
    {/snippet}
  </WrapWithTemplate>
{/if}
