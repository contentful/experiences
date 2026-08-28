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

  import ComponentError from './ComponentError.svelte';
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
    debug = false,
    renderUnknown = MissingComponent,
    renderError = ComponentError,
  }: ClientExperienceRendererProps = $props();

  // Render-time diagnostics, `$state`-backed so a component that throws well
  // after first paint (a later re-render, an event handler) still makes
  // `<DebugExperience>` re-render with the new diagnostic — a mutated plain
  // array wouldn't be reactive here the way it's fine to be for the
  // synchronous, single-pass server renderer.
  //
  // `queueMicrotask` defers the actual mutation: most of these diagnostics
  // (component-not-registered, malformed-slot,
  // experience-template-not-registered) are reported from NodeRenderer's
  // `{@const}`/`$derived.by` blocks — i.e. from inside a template expression
  // — and Svelte 5 forbids mutating `$state` there directly
  // ("state_unsafe_mutation"). Escaping to a microtask (same "break the
  // synchronous call chain" rationale as core's resolveData deferral)
  // performs the mutation once that expression has finished evaluating.
  // `component-render-error`, reported from `<svelte:boundary onerror>`
  // (already outside any derived/template evaluation), is unaffected by the
  // restriction but deferred too, to keep one code path.
  const renderDiagnostics = $state<Error[]>([]);
  function onDiagnostic(error: Error): void {
    queueMicrotask(() => {
      renderDiagnostics.push(error);
    });
  }

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
    liveContext.debug = debug;
    liveContext.metadata = { ...DEFAULT_CONTEXT.metadata, ...(metadata ?? {}) };
  });
</script>

{#if experience}
  <NodesRenderer
    nodes={experience.nodes}
    {config}
    experience={liveContext}
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
