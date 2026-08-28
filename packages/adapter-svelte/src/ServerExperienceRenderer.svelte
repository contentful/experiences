<!--
 * Server-safe Experience renderer. Resolves the active viewport once from
 * `initialViewportId` (typically derived from User-Agent on the request)
 * and renders without any reactive subscription. SSR-friendly.
 *
 * SSR + interactive editor mode are mutually exclusive — the message-event
 * preview client requires window listeners and lives only in the client
 * renderer. For editor mode, render the client variant on a hydrated route.
-->
<script lang="ts">
  import type { ExperienceContext, ViewportDef } from '@contentful/experiences-sdk-core';
  import { getViewportIndex } from '@contentful/experiences-design';

  import DebugExperience from './DebugExperience.svelte';
  import MissingComponent from './MissingComponent.svelte';
  import NodesRenderer from './NodesRenderer.svelte';
  import type { ServerExperienceRendererProps } from './component-props.js';
  import { setExperience } from './context.js';
  import type { RenderContext } from './types.js';

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
    renderUnknown = MissingComponent,
  }: ServerExperienceRendererProps = $props();

  function buildContext(): RenderContext {
    const viewports = experience?.viewports ?? [];
    // Default to the pre-resolved viewport so first paint needs no recompute.
    const idx = !experience
      ? 0
      : initialViewportId === undefined
        ? experience.fallbackViewportIndex
        : getViewportIndex(experience.viewports, initialViewportId);
    return {
      ...DEFAULT_CONTEXT,
      debug: experience?.debug ?? false,
      metadata: experience?.metadata ?? DEFAULT_CONTEXT.metadata,
      viewports,
      activeViewport: experience?.viewports[idx] ?? FALLBACK_VIEWPORT,
      activeViewportIndex: idx,
      fallbackViewportIndex: experience?.fallbackViewportIndex ?? 0,
    };
  }

  const renderContext = buildContext();
  setExperience(renderContext);
</script>

{#if experience}
  {#if experience.debug}
    <DebugExperience {experience} />
  {/if}
  <NodesRenderer
    nodes={experience.nodes}
    {config}
    experience={renderContext}
    {renderUnknown}
  />
{/if}
