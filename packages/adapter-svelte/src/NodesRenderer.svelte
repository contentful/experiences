<!--
 * Recursive renderer over PortableRenderNodes. Customer components receive
 * a single `slot` Snippet that, when rendered with a slot name, expands to
 * that slot's pre-rendered children:
 *
 *     <script>
 *       let { text, slot } = $props();
 *     </script>
 *     <button>
 *       {text}
 *       {@render slot('children')}
 *     </button>
 *
 * Why a single `slot` snippet (parameterized by name) instead of one named
 * prop per slot like the React adapter? Svelte 5 Snippets are compile-time
 * entities — there's no way to dynamically synthesize `{children, header}`
 * snippets from runtime payload data. Passing a single dispatcher snippet
 * is the idiomatic Svelte workaround and parallels how Svelte's own
 * `<svelte:fragment slot="...">` worked in Svelte 4.
 *
 * Server vs client variants share this component; they differ only in how
 * the active viewport is sourced (initial seed vs reactive matchMedia).
-->
<script lang="ts">
  import type { PortableRenderNode } from '@contentful/experiences-core';
  import { resolveDesignProperties } from '@contentful/experiences-design';

  import NodesRenderer from './NodesRenderer.svelte';
  import type { RenderUnknown } from './component-props.js';
  import type { Config, RenderContext } from './types.js';

  interface NodesRendererProps {
    nodes: PortableRenderNode[];
    config: Config;
    experience: RenderContext;
    renderUnknown: RenderUnknown;
  }

  let { nodes, config, experience, renderUnknown }: NodesRendererProps = $props();

  function buildProps(node: PortableRenderNode): Record<string, unknown> {
    const componentConfig = config.components[node.registration.componentTypeId];
    if (!componentConfig) return {};
    // Resolve viewport-keyed design values into plain scalars at render time
    // (so client viewport changes don't invalidate the resolveData step).
    const resolvedDesign = resolveDesignProperties(
      node.props.design,
      experience.viewports,
      experience.activeViewportIndex
    );
    // Merge precedence (last wins): defaults < content < design <
    // resolveData output < experience. Slots are passed via the
    // `slot` snippet prop separately.
    return {
      ...componentConfig.defaults,
      ...node.props.content,
      ...resolvedDesign,
      ...node.props.resolved,
      experience,
    };
  }
</script>

{#each nodes as node, index (node.nodeId ?? index)}
  {@const componentConfig = config.components[node.registration.componentTypeId]}
  {#if componentConfig}
    {@const Cmp = componentConfig.component}
    {#snippet slot(slotName: string)}
      {@const children = node.slots[slotName] ?? []}
      <NodesRenderer nodes={children} {config} {experience} {renderUnknown} />
    {/snippet}
    <Cmp {...buildProps(node)} {slot} />
  {:else}
    {@const Unknown = renderUnknown}
    <Unknown
      componentTypeId={node.registration.componentTypeId}
      nodeId={node.nodeId}
      {experience}
    />
  {/if}
{/each}
