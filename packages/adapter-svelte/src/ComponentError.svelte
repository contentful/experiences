<!--
 * Default fallback rendered when a registered component throws while
 * rendering. Sibling of `MissingComponent` — same debug-gated behavior
 * (visible box in debug mode, silent null otherwise), visually distinct
 * (different color/label) so a customer can tell "not registered" apart
 * from "registered but threw" at a glance. The diagnostic + console.warn
 * for this failure mode are recorded once, at the `<svelte:boundary>` call
 * site in `NodeRenderer.svelte` — not here — so they still fire even when a
 * customer overrides `renderError` with their own fallback.
-->
<script lang="ts">
  import type { ComponentErrorProps } from './component-props.js';
  import { getExperience } from './context.js';

  let { componentId, nodeId, message }: ComponentErrorProps = $props();
  const experience = getExperience();
</script>

{#if experience.debug}
  <div
    style="border: 2px solid #b91c1c; padding: 1rem; color: #b91c1c; background: #fff; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.8125rem;"
    data-experiences-render-error={componentId}
  >
    <strong>Component &lsquo;{componentId}&rsquo; threw while rendering</strong>
    <p style="margin: 0.5rem 0;">
      This component is registered but threw during render. Rendering this fallback instead of
      crashing the surrounding tree.
    </p>
    <pre style="margin: 0; white-space: pre-wrap;">{JSON.stringify(
        { componentId, nodeId: nodeId ?? null, message: message ?? null },
        null,
        2
      )}</pre>
  </div>
{/if}
