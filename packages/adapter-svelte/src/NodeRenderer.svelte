<!--
 * Single-node renderer. Splits out of NodesRenderer so the per-node
 * `setContext` for the contentful payload happens during *that node's*
 * component init (Svelte's setContext can only be called at top level).
-->
<script lang="ts">
  import type { Snippet } from 'svelte';

  import type { PortableRenderNode } from '@contentful/experiences-core';
  import { resolveDesignProperties } from '@contentful/experiences-design';

  import { setContentfulComponent } from './context.js';
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

  const composed = $derived.by(() => {
    if (!componentConfig) return null;
    const resolvedDesign = resolveDesignProperties(
      node.props.design,
      experience.viewports,
      experience.activeViewportIndex
    );
    return {
      ...componentConfig.defaults,
      ...node.props.content,
      ...resolvedDesign,
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
