<!--
 * Server-safe Experience renderer. It renders the resolved plan directly.
 *
 * SSR + interactive editor mode are mutually exclusive — the message-event
 * preview client requires window listeners and lives only in the client
 * renderer. For editor mode, render the client variant on a hydrated route.
-->
<script lang="ts">
  import type { ExperienceContext } from '@contentful/experiences-sdk-core';

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
  };

  let {
    experience,
    config,
    metadata,
    debug,
    renderUnknown = MissingComponent,
    renderError = ComponentError,
  }: ServerExperienceRendererProps = $props();

  // `??`, not `||`, so an explicit `debug={false}` overrides a debug-on plan.
  const resolvedDebug = $derived(debug ?? experience?.debug ?? false);

  function buildContext(): RenderContext {
    return {
      ...DEFAULT_CONTEXT,
      debug: resolvedDebug,
      metadata: {
        ...DEFAULT_CONTEXT.metadata,
        ...(experience?.metadata ?? {}),
        ...(metadata ?? {}),
      },
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
  const renderDiagnostics: Error[] = [];
  function onDiagnostic(error: Error): void {
    renderDiagnostics.push(error);
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
