<!-- Shared supplied-plan traversal; the public facades select context/diagnostic timing. -->
<script lang="ts">
  import { untrack } from 'svelte';

  import ComponentError from '../diagnostics/ComponentError.svelte';
  import DebugExperience from '../diagnostics/DebugExperience.svelte';
  import MissingComponent from '../diagnostics/MissingComponent.svelte';
  import NodesRenderer from './NodesRenderer.svelte';
  import type { ServerExperienceRendererProps } from './component-props.js';
  import { setExperience } from './context.js';
  import type { RenderContext } from '../registry/types.js';

  let {
    experience,
    config,
    metadata,
    debug,
    renderUnknown = MissingComponent,
    renderError = ComponentError,
    mode,
  }: ServerExperienceRendererProps & { mode: 'client' | 'server' } = $props();

  // The facade selects one lifetime policy, even when the server facade is
  // mounted in a browser. Explicit false overrides a debug-on plan.
  const reactive = untrack(() => mode === 'client');
  const resolvedDebug = $derived(debug ?? experience?.debug ?? false);

  function buildContext(): RenderContext {
    return {
      debug: resolvedDebug,
      metadata: {
        ...(experience?.metadata ?? {}),
        ...(metadata ?? {}),
      },
    };
  }

  // Server context is captured once. Client context keeps a stable reactive
  // object so descendants reading getExperience() observe later plan/options.
  const initialContext = untrack(buildContext);
  const liveContext = $state<RenderContext>(initialContext);
  const renderContext = reactive ? liveContext : initialContext;
  setExperience(renderContext);

  $effect(() => {
    if (!reactive || !experience) return;
    const next = buildContext();
    liveContext.debug = next.debug;
    liveContext.metadata = next.metadata;
  });

  // Server traversal reports synchronously into a plain array so the debug
  // panel below sees the entire tree's diagnostics during its SSR pass.
  // Client diagnostics are reactive and deferred: NodeRenderer can report
  // from a derived/template expression, where Svelte forbids state mutation.
  const liveDiagnostics = $state<Error[]>([]);
  const renderDiagnostics = reactive ? liveDiagnostics : [];
  function onDiagnostic(error: Error): void {
    if (reactive) {
      queueMicrotask(() => {
        renderDiagnostics.push(error);
      });
    } else {
      renderDiagnostics.push(error);
    }
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
  {#if resolvedDebug}
    <DebugExperience
      {experience}
      errors={[...(experience.diagnostics ?? []), ...renderDiagnostics]}
    />
  {/if}
{/if}
