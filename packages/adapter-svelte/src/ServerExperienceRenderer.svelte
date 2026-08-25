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
  import type {
    ExperienceContext,
    ExperienceDiagnostic,
    ViewportDef,
  } from '@contentful/experiences-sdk-core';
  import { getViewportIndex } from '@contentful/experiences-design';

  import ComponentError from './ComponentError.svelte';
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
    metadata,
    debug = false,
    renderUnknown = MissingComponent,
    renderError = ComponentError,
  }: ServerExperienceRendererProps = $props();

  function buildContext(): RenderContext {
    const viewports = experience?.viewports ?? [];
    const idx = experience ? getViewportIndex(experience.viewports, initialViewportId) : 0;
    return {
      ...DEFAULT_CONTEXT,
      debug,
      metadata: { ...DEFAULT_CONTEXT.metadata, ...(metadata ?? {}) },
      viewports,
      activeViewport: experience?.viewports[idx] ?? FALLBACK_VIEWPORT,
      activeViewportIndex: idx,
      fallbackViewportIndex: experience?.fallbackViewportIndex ?? 0,
    };
  }

  const renderContext = buildContext();
  setExperience(renderContext);

  // Render-time diagnostics (unregistered id, a component that threw),
  // collected into a plain array rather than `$state`: Svelte SSR is
  // synchronous top-down, so by the time `<DebugExperience>` renders — after
  // the tree, matching the React adapter's element-order fix for
  // consistency, even though Svelte's own reactivity wouldn't strictly
  // require it — this array is already fully populated.
  const renderDiagnostics: ExperienceDiagnostic[] = [];
  function onDiagnostic(diagnostic: ExperienceDiagnostic): void {
    renderDiagnostics.push(diagnostic);
  }
</script>

{#if experience}
  <NodesRenderer
    nodes={experience.nodes}
    {config}
    experience={renderContext}
    {renderUnknown}
    {renderError}
    {onDiagnostic}
  />
  {#if debug}
    <DebugExperience
      {experience}
      errors={[...(experience.diagnostics ?? []), ...renderDiagnostics]}
    />
  {/if}
{/if}
