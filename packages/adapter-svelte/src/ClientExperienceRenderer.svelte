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
    debug,
    renderUnknown = MissingComponent,
  }: ClientExperienceRendererProps = $props();

  // Plan is the source of truth; props override. See ServerExperienceRenderer.
  const resolvedDebug = $derived(debug ?? experience?.debug ?? false);

  const viewports = $derived(experience?.viewports ?? []);
  // Seed from the plan's pre-resolved viewport when no explicit id is given, so
  // first paint matches the server renderer. See ServerExperienceRenderer.
  const seedViewportId = $derived(
    initialViewportId ?? experience?.viewports[experience.fallbackViewportIndex]?.id
  );
  const tracker = useActiveViewport(viewports, seedViewportId);

  // A $state-backed mirror so descendants reading getExperience() stay
  // reactive across viewport changes. The fields update in an $effect below.
  const liveContext = $state<RenderContext>({
    ...DEFAULT_CONTEXT,
    debug: debug ?? experience?.debug ?? false,
    metadata: {
      ...DEFAULT_CONTEXT.metadata,
      ...(experience?.metadata ?? {}),
      ...(metadata ?? {}),
    },
    viewports: experience?.viewports ?? [],
    activeViewport: experience?.viewports[0] ?? FALLBACK_VIEWPORT,
    activeViewportIndex: 0,
    fallbackViewportIndex: experience?.fallbackViewportIndex ?? 0,
  });

  setExperience(liveContext);

  $effect(() => {
    if (!experience) return;
    const idx = tracker.activeViewportIndex;
    liveContext.viewports = experience.viewports;
    liveContext.activeViewport = experience.viewports[idx] ?? FALLBACK_VIEWPORT;
    liveContext.activeViewportIndex = idx;
    liveContext.fallbackViewportIndex = experience.fallbackViewportIndex;
    liveContext.debug = resolvedDebug;
    liveContext.metadata = {
      ...DEFAULT_CONTEXT.metadata,
      ...experience.metadata,
      ...(metadata ?? {}),
    };
  });
</script>

{#if experience}
  {#if resolvedDebug}
    <DebugExperience {experience} />
  {/if}
  <NodesRenderer
    nodes={experience.nodes}
    {config}
    experience={liveContext}
    {renderUnknown}
  />
{/if}
