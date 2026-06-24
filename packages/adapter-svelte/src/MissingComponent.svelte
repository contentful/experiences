<!--
 * Default fallback rendered when an instance references a component type
 * not present in the Config.
 *
 * Behavior: a visible red error box in preview, silent null in production.
 * Customers can override per-render via <ServerExperienceRenderer renderUnknown=... />.
-->
<script lang="ts">
  import type { MissingComponentProps } from './component-props.js';

  let { componentTypeId, nodeId, experience }: MissingComponentProps = $props();

  $effect(() => {
    if (typeof console !== 'undefined') {
      const idLabel = nodeId ? ` (nodeId: ${nodeId})` : '';
      console.warn(
        `[@contentful/experiences] No component registered for type "${componentTypeId}"${idLabel}.`
      );
    }
  });
</script>

{#if experience.isPreview}
  <div
    style="border: 2px solid red; padding: 1rem; color: red; background: #fff;"
    data-experiences-missing={componentTypeId}
  >
    <strong>Missing component &lsquo;{componentTypeId}&rsquo;</strong>
    <p>
      This component is referenced by the Experience payload but is not registered in the Config.
    </p>
  </div>
{/if}
