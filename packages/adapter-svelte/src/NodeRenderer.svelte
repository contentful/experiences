<!--
 * Single-node renderer. Splits out of NodesRenderer so the per-node
 * `setContext` for the contentful payload happens during *that node's*
 * component init (Svelte's setContext can only be called at top level).
-->
<script lang="ts">
  import type { Snippet } from 'svelte';

  import type { PortableRenderNode } from '@contentful/experiences-sdk-core';

  import { setContentfulComponent, setResolvedDesign } from './context.js';
  import { selectResolvedDesign } from './design-utils.js';
  import type { RenderUnknown } from './component-props.js';
  import {
    normalizeComponentRegistration,
    type ContentfulComponent,
    type Config,
    type RenderContext,
  } from './types.js';

  interface NodeRendererProps {
    node: PortableRenderNode;
    config: Config;
    experience: RenderContext;
    renderUnknown: RenderUnknown;
    children: Snippet;
  }

  let { node, config, experience, renderUnknown, children }: NodeRendererProps = $props();

  const entry = $derived(config.components[node.registration.componentTypeId]);
  const componentConfig = $derived(entry ? normalizeComponentRegistration(entry) : null);

  const contentful: ContentfulComponent = {
    componentTypeId: node.registration.componentTypeId,
    nodeId: node.nodeId,
    content: node.props.content,
    design: node.props.design,
    resolved: node.props.resolved,
    slots: node.slots,
  };
  setContentfulComponent(contentful);

  // Prefer the server pre-resolved design values when the active viewport
  // matches the fallback; otherwise cascade + resolve tokens here. Auto-filled
  // onto matching props (below content/resolveData) and published on context
  // for getDesignValues().
  const tokenResolvedDesign = $derived.by(() => {
    const { props, unresolved } = selectResolvedDesign(
      node.props,
      experience.viewports,
      experience.activeViewportIndex,
      experience.fallbackViewportIndex,
      config.resolveToken
    );
    if (unresolved.length && typeof console !== 'undefined') {
      console.warn(
        `[@contentful/experiences-svelte] resolveToken returned undefined for token id(s) on "${node.registration.componentTypeId}": ${unresolved.join(', ')}. getDesignValues() will omit those keys.`
      );
    }
    return props;
  });

  setResolvedDesign(() => tokenResolvedDesign);

  // Merge precedence (last wins): defaults < design < content < resolveData
  // < children. Resolved design values auto-fill matching props (by their raw
  // design key, e.g. `cfColor`), below content/resolveData so explicit values
  // always win. Same values remain available via getDesignValues().
  const composed = $derived.by(() => {
    if (!componentConfig) return null;
    return {
      ...componentConfig.defaults,
      ...tokenResolvedDesign,
      ...node.props.content,
      ...node.props.resolved,
      children,
    };
  });
</script>

{#if componentConfig && composed}
  {@const Cmp = componentConfig.component}
  <Cmp {...composed} />
{:else}
  {@const Unknown = renderUnknown}
  <Unknown
    componentTypeId={node.registration.componentTypeId}
    nodeId={node.nodeId}
  />
{/if}
