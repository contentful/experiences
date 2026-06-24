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
  import type { RenderContext } from './types.js';

  const DEFAULT_CONTEXT: ExperienceContext = {
    isPreview: false,
    metadata: {},
  };

  // Fallback used when an experience payload arrives with no declared viewports.
  // `getValueForViewport` will treat any design value as `undefined` because
  // the cascade list is empty, so this only exists to keep `activeViewport`
  // non-null in the render context's type.
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

  const renderContext = $derived.by((): RenderContext | null => {
    if (!experience) return null;
    const activeViewportIndex = getViewportIndex(experience.viewports, initialViewportId);
    const activeViewport = experience.viewports[activeViewportIndex] ?? FALLBACK_VIEWPORT;
    return {
      ...DEFAULT_CONTEXT,
      ...context,
      metadata: { ...DEFAULT_CONTEXT.metadata, ...(context?.metadata ?? {}) },
      viewports: experience.viewports,
      activeViewport,
      activeViewportIndex,
    };
  });
</script>

{#if experience && renderContext}
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
