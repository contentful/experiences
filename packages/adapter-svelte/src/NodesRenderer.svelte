<!--
 * Recursive renderer over PortableRenderNodes. Customer components receive
 * plain Svelte props — the merged content / design / resolveData prop bag
 * plus the default `children` slot as a named Snippet:
 *
 *     <script lang="ts">
 *       import type { Snippet } from 'svelte';
 *       let { text, children }: { text?: string; children?: Snippet } = $props();
 *     </script>
 *     <button>
 *       {text}
 *       {@render children?.()}
 *     </button>
 *
 * Only the `children` slot is rendered automatically — Svelte 5 Snippets are
 * compile-time entities, so the renderer can't synthesize an unbounded set
 * of named Snippet props from runtime payload data. The `children` slot is
 * what every payload uses in practice. If a payload carries additional named
 * slots, they're reachable through `getContentfulComponent().slots` and the
 * exported `<NodesRenderer />` component — see README.
 *
 * The Experience runtime context and the raw Contentful payload are exposed
 * via Svelte context (`getExperience`, `getContentfulComponent`) rather than
 * spread as props — keeping customer components portable.
 *
 * Server vs client variants share this component; they differ only in how
 * the active viewport is sourced (initial seed vs reactive matchMedia).
-->
<script lang="ts">
  import type { PortableRenderNode } from '@contentful/experiences-core';

  import NodeRenderer from './NodeRenderer.svelte';
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
</script>

{#each nodes as node, index (node.nodeId ?? index)}
  {#snippet children()}
    {@const childrenNodes = (node.slots.children ?? []) as PortableRenderNode[]}
    <NodesRenderer nodes={childrenNodes} {config} {experience} {renderUnknown} />
  {/snippet}
  <NodeRenderer {node} {config} {experience} {renderUnknown} {children} />
{/each}
