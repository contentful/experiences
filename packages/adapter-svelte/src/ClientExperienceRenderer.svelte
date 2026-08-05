<!--
 * Client Experience renderer. First paint matches the server renderer
 * (active viewport resolved from `initialViewportId`); after hydration,
 * `useActiveViewport` takes over via `window.matchMedia` and re-renders
 * when the viewport changes.
 *
 * Safe to render on the server: `useActiveViewport` no-ops outside the
 * browser, so SSR output matches `<ServerExperienceRenderer>` given the
 * same seed.
-->
<script lang="ts">
  import type { ExperienceContext, ViewportDef } from '@contentful/experiences-sdk-core';

  import DebugExperience from './DebugExperience.svelte';
  import MissingComponent from './MissingComponent.svelte';
  import NodesRenderer from './NodesRenderer.svelte';
  import WrapWithTemplate from './WrapWithTemplate.svelte';
  import type { ClientExperienceRendererProps } from './component-props.js';
  import { setExperience } from './context.js';
  import type { RenderContext } from './types.js';
  import { useActiveViewport } from './use-active-viewport.svelte.js';

  const DEFAULT_CONTEXT: ExperienceContext = {
    debug: false,
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
    metadata,
    debug = false,
    renderUnknown = MissingComponent,
  }: ClientExperienceRendererProps = $props();

  const viewports = $derived(experience?.viewports ?? []);
  const tracker = useActiveViewport(viewports, initialViewportId);

  // A $state-backed mirror so descendants reading getExperience() stay
  // reactive across viewport changes. The fields update in an $effect below.
  const liveContext = $state<RenderContext>({
    ...DEFAULT_CONTEXT,
    debug,
    metadata: { ...DEFAULT_CONTEXT.metadata, ...(metadata ?? {}) },
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
    liveContext.debug = debug;
    liveContext.metadata = { ...DEFAULT_CONTEXT.metadata, ...(metadata ?? {}) };
  });
</script>

{#if experience}
  {#if debug}
    <DebugExperience {experience} />
  {/if}
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
