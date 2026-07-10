<!--
 * Universal Experience renderer — safe to render on the server AND on
 * the client. SSR emits the same output as `ServerExperienceRenderer`
 * for first paint; after hydration, `useActiveViewport` takes over via
 * `window.matchMedia` and re-renders as viewports change.
 *
 * Use `initialViewportId` (typically derived from User-Agent on the
 * server) to seed the first render, matching what the server emitted.
 * `useActiveViewport` registers no listeners when `typeof window ===
 * 'undefined'`, so SSR output is deterministic.
 *
 * When `enablePreview` is set, the renderer additionally connects to the
 * parent editor via postMessage — but only after the component mounts
 * on the client (Svelte 5 `$effect` runs client-only, so the preview
 * override's effect is inherently SSR-safe). Before `init` arrives — or
 * when the app is not embedded in a known editor origin — rendering
 * stays with the `experience` prop. Once `init` arrives, the editor's
 * plan is rendered instead and subsequent `viewUpdate` messages replace
 * it in place.
-->
<script lang="ts">
  import type { ExperienceContext, ViewportDef } from '@contentful/experiences-core';
  import {
    createPreviewOverride,
    createResolvedPreviewPlan,
  } from '@contentful/experiences-preview-svelte';

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
    enablePreview = false,
    previewCapabilities,
    previewTargetOrigin,
  }: ClientExperienceRendererProps = $props();

  // Set of component-type ids the customer registered — used by the
  // preview override to detect missing components in the incoming view
  // and report `partial` render status back to the editor.
  const knownComponentTypeIds = $derived(new Set(Object.keys(config.components)));

  const preview = createPreviewOverride(
    {
      enabled: enablePreview,
      capabilities: previewCapabilities,
      targetOrigin: previewTargetOrigin,
    },
    // Only pass the known set when preview is on; otherwise the override
    // reports `ok` unconditionally (and no work happens in the effect
    // because the handshake never advances).
    enablePreview ? knownComponentTypeIds : null
  );

  const resolved = createResolvedPreviewPlan(() => preview.view, config);

  // postMessage view wins once it arrives (and finishes resolving);
  // otherwise the prop is authoritative.
  const activeExperience = $derived(resolved.plan ?? experience);

  const viewports = $derived(activeExperience?.viewports ?? []);
  const tracker = useActiveViewport(viewports, initialViewportId);

  const renderContext = $derived.by((): RenderContext | null => {
    if (!activeExperience) return null;
    const activeViewport =
      activeExperience.viewports[tracker.activeViewportIndex] ?? FALLBACK_VIEWPORT;
    return {
      ...DEFAULT_CONTEXT,
      ...context,
      metadata: { ...DEFAULT_CONTEXT.metadata, ...(context?.metadata ?? {}) },
      viewports: activeExperience.viewports,
      activeViewport,
      activeViewportIndex: tracker.activeViewportIndex,
    };
  });
</script>

{#if activeExperience && renderContext}
  <WrapWithTemplate template={activeExperience.template} {config} experience={renderContext}>
    {#snippet children()}
      <NodesRenderer
        nodes={activeExperience.nodes}
        {config}
        experience={renderContext}
        {renderUnknown}
      />
    {/snippet}
  </WrapWithTemplate>
{/if}
