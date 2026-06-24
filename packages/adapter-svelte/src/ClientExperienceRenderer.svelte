<!--
 * Client-side Experience renderer. Uses the `useActiveViewport` rune to
 * react to `window.matchMedia` changes.
 *
 * Throws if rendered on the server — pair with `ServerExperienceRenderer`
 * for SSR. Use `initialViewportId` (typically derived from User-Agent on
 * the server) to seed the first render, matching what the server emitted;
 * the rune then takes over via media queries to switch viewports as the
 * window resizes.
-->
<script lang="ts">
  import type { ExperienceContext, ViewportDef } from '@contentful/experiences-core';

  import MissingComponent from './MissingComponent.svelte';
  import NodesRenderer from './NodesRenderer.svelte';
  import WrapWithTemplate from './WrapWithTemplate.svelte';
  import type { ClientExperienceRendererProps } from './component-props.js';
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

  if (typeof window === 'undefined') {
    throw new Error(
      'ClientExperienceRenderer cannot be used on the server. Use ServerExperienceRenderer for SSR.'
    );
  }

  const viewports = $derived(experience?.viewports ?? []);
  const tracker = useActiveViewport(viewports, initialViewportId);

  const renderContext = $derived.by((): RenderContext | null => {
    if (!experience) return null;
    const activeViewport = experience.viewports[tracker.activeViewportIndex] ?? FALLBACK_VIEWPORT;
    return {
      ...DEFAULT_CONTEXT,
      ...context,
      metadata: { ...DEFAULT_CONTEXT.metadata, ...(context?.metadata ?? {}) },
      viewports: experience.viewports,
      activeViewport,
      activeViewportIndex: tracker.activeViewportIndex,
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
