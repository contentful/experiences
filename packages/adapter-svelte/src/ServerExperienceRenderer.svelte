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
  import type { ExperienceContext, ViewportDef } from '@contentful/experiences-core';
  import { getViewportIndex } from '@contentful/experiences-design';

  import MissingComponent from './MissingComponent.svelte';
  import NodesRenderer from './NodesRenderer.svelte';
  import WrapWithTemplate from './WrapWithTemplate.svelte';
  import type { ServerExperienceRendererProps } from './component-props.js';
  import { setExperience } from './context.js';
  import type { RenderContext } from './types.js';

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
  }: ServerExperienceRendererProps = $props();

  function buildContext(): RenderContext {
    const viewports = experience?.viewports ?? [];
    const idx = experience ? getViewportIndex(experience.viewports, initialViewportId) : 0;
    return {
      ...DEFAULT_CONTEXT,
      ...context,
      metadata: { ...DEFAULT_CONTEXT.metadata, ...(context?.metadata ?? {}) },
      viewports,
      activeViewport: experience?.viewports[idx] ?? FALLBACK_VIEWPORT,
      activeViewportIndex: idx,
    };
  }

  const renderContext = buildContext();
  setExperience(renderContext);
</script>

{#if experience}
  <WrapWithTemplate template={experience.template} {config} experience={renderContext}>
    {#snippet children()}
      <NodesRenderer
        nodes={experience.nodes}
        {config}
        experience={renderContext}
        {renderUnknown}
      />
    {/snippet}
  </WrapWithTemplate>
{/if}
