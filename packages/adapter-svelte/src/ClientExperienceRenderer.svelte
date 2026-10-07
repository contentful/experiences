<!--
 * Client Experience renderer. It renders the resolved plan directly, with no
 * browser-only design-property work.
-->
<script lang="ts">
  import type { ExperienceContext } from '@contentful/experiences-sdk-core';

  import ComponentError from './ComponentError.svelte';
  import DebugExperience from './DebugExperience.svelte';
  import MissingComponent from './MissingComponent.svelte';
  import NodesRenderer from './NodesRenderer.svelte';
  import type { ClientExperienceRendererProps } from './component-props.js';
  import { setExperience } from './context.js';
  import type { RenderContext } from './types.js';

  const DEFAULT_CONTEXT: ExperienceContext = {
    debug: false,
    metadata: {},
  };

  let {
    experience,
    config,
    metadata,
    debug,
    renderUnknown = MissingComponent,
    renderError = ComponentError,
  }: ClientExperienceRendererProps = $props();

  // `??`, not `||`, so an explicit `debug={false}` overrides a debug-on plan.
  const resolvedDebug = $derived(debug ?? experience?.debug ?? false);

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

  // A $state-backed mirror so descendants reading getExperience() stay
  // reactive when the plan or rendering options change.
  const liveContext = $state<RenderContext>({
    ...DEFAULT_CONTEXT,
    debug: debug ?? experience?.debug ?? false,
    metadata: {
      ...DEFAULT_CONTEXT.metadata,
      ...(experience?.metadata ?? {}),
      ...(metadata ?? {}),
    },
  });

  setExperience(liveContext);

  $effect(() => {
    if (!experience) return;
    liveContext.debug = resolvedDebug;
    liveContext.metadata = {
      ...DEFAULT_CONTEXT.metadata,
      ...experience.metadata,
      ...(metadata ?? {}),
    };
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
  {#if resolvedDebug}
    <DebugExperience
      {experience}
      errors={[...(experience.diagnostics ?? []), ...renderDiagnostics]}
    />
  {/if}
{/if}
