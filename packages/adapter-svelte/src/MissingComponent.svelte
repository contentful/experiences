<!--
 * Default fallback rendered when an instance references a component
 * not present in the Config.
 *
 * Behavior: a visible debug box when `debug` is on, silent null otherwise.
 * The console.warn fires either way so the miss is never fully silent.
 * Customers can override per-render via <ServerExperienceRenderer renderUnknown=... />.
-->
<script lang="ts">
  import type { MissingComponentProps } from './component-props.js';
  import { getExperience } from './context.js';

  let { componentId, nodeId }: MissingComponentProps = $props();
  const experience = getExperience();

  $effect(() => {
    if (typeof console !== 'undefined') {
      const idLabel = nodeId ? ` (nodeId: ${nodeId})` : '';
      console.warn(
        `[@contentful/experiences] No component registered for id "${componentId}"${idLabel}.`
      );
    }
  });
</script>

{#if experience.debug}
  <div
    style="border: 2px solid red; padding: 1rem; color: red; background: #fff; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.8125rem;"
    data-experiences-missing={componentId}
  >
    <strong>Missing component &lsquo;{componentId}&rsquo;</strong>
    <p style="margin: 0.5rem 0;">
      This component is referenced by the Experience payload but is not registered in the Config.
      Register it under this key in your <code>components</code> map:
    </p>
    <pre style="margin: 0; white-space: pre-wrap;">{JSON.stringify(
        { componentId, nodeId: nodeId ?? null },
        null,
        2
      )}</pre>
  </div>
{/if}
