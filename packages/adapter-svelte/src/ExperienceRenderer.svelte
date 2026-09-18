<!--
 * The Experience renderer, for both SSR and client rendering.
 *
 * Unlike React, Svelte has no server/client component split to respect —
 * `$state` works identically under SSR and in the browser — so this needs no
 * debug-only client boundary the way the React adapter does.
-->
<script lang="ts">
  import type { ExperienceContext } from '@contentful/experiences-sdk-core';

  import ComponentError from './ComponentError.svelte';
  import DebugExperience from './DebugExperience.svelte';
  import MissingComponent from './MissingComponent.svelte';
  import NodesRenderer from './NodesRenderer.svelte';
  import type { ExperienceRendererProps } from './component-props.js';
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
  }: ExperienceRendererProps = $props();

  // `??`, not `||`, so an explicit `debug={false}` overrides a debug-on plan.
  const resolvedDebug = $derived(debug ?? experience?.debug ?? false);

  // A `$state` mirror so descendants reading `getExperience()` stay reactive
  // when the renderer's props change; fields update in the `$effect` below.
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

  // Two collectors, both needed.
  //
  // `syncDiagnostics` is plain (non-reactive) because most diagnostics are
  // reported from NodeRenderer's `{@const}`/`$derived.by` blocks, where Svelte 5
  // forbids mutating `$state` ("state_unsafe_mutation"). Render is top-down, so
  // it is populated by the time the panel reads it — which is what makes those
  // show up under SSR, where no microtask runs before serialization.
  //
  // `asyncDiagnostics` is `$state`-backed for the one case the synchronous pass
  // cannot catch: a component throwing after first paint, via
  // `<svelte:boundary onerror>`. Deferred to a microtask so the reporter stays
  // callable from a template expression.
  const syncDiagnostics: Error[] = [];
  const asyncDiagnostics = $state<Error[]>([]);
  const seenDiagnostics = new Set<string>();

  function onDiagnostic(error: Error): void {
    // Dedup by message: an ancestor re-render re-reports the same diagnostic.
    if (seenDiagnostics.has(error.message)) return;
    seenDiagnostics.add(error.message);
    syncDiagnostics.push(error);
    queueMicrotask(() => {
      asyncDiagnostics.push(error);
    });
  }

  // Reading `asyncDiagnostics.length` is what makes this re-run on a post-paint
  // throw. Both arrays hold the same entries; the synchronous one is the
  // fallback for SSR, where the microtask above never runs in time.
  const debugErrors = $derived([
    ...(experience?.diagnostics ?? []),
    ...(asyncDiagnostics.length ? asyncDiagnostics : syncDiagnostics),
  ]);
</script>

<!-- Tree before the panel, matching the React adapter's element order. -->
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
    <DebugExperience {experience} errors={debugErrors} />
  {/if}
{/if}
