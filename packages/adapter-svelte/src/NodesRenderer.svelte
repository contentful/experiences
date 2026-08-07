<!--
 * Recursive renderer over PortableRenderNodes. Customer components receive
 * the merged content / design / resolveData prop bag plus the default
 * `children` slot as an ARRAY of Snippets — one zero-arg Snippet per
 * pre-rendered child node — declared as `children?: Snippet[]`. A component
 * renders them all with an each-block + @render, or maps/filters/wraps the
 * children individually. The array mirrors the React adapter's ReactNode[]
 * slot contract; see the README for the consuming-a-slot example.
 *
 * Only the default `children` slot is injected as a prop — Svelte 5 Snippets
 * are compile-time entities, so the renderer can't synthesize an unbounded
 * set of named Snippet props from runtime payload data. Additional named
 * slots are reachable through `getContentfulComponent().slots` and can be
 * rendered with the exported NodesRenderer (see README).
 *
 * The Experience runtime context and the raw Contentful payload are read
 * via `getExperience` / `getContentfulComponent`.
 *
 * Server vs client variants share this component; they differ only in how
 * the active viewport is sourced (initial seed vs reactive matchMedia).
-->
<script lang="ts">
  import type { Snippet } from 'svelte';

  import type { PortableRenderNode } from '@contentful/experiences-sdk-core';

  import NodeRenderer from './NodeRenderer.svelte';
  import type { RenderUnknown } from './component-props.js';
  import type { Config, RenderContext } from './types.js';

  interface NodesRendererProps {
    nodes: PortableRenderNode[];
    config: Config;
    experience: RenderContext;
    renderUnknown: RenderUnknown;
  }

  let { nodes, config, experience, renderUnknown }: NodesRendererProps = $props();

  // Curry the parameterized `renderNode` snippet into a zero-arg Snippet bound
  // to one node. Svelte 5 invokes a snippet as `(anchor, ...argGetters)`, so we
  // forward the anchor and supply the node through a getter. This is the one
  // spot that leans on Svelte's snippet calling convention; pinned by the
  // `children`-array tests in server-renderer.test.ts.
  function toChildSnippet(node: PortableRenderNode): Snippet {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- programmatic snippet construction; see note above.
    return ((anchor: unknown) => (renderNode as any)(anchor, () => node)) as Snippet;
  }
</script>

{#snippet renderNode(node: PortableRenderNode)}
  {@const childNodes = (node.slots.children ?? []) as PortableRenderNode[]}
  {@const children = childNodes.map(toChildSnippet)}
  <NodeRenderer {node} {config} {experience} {renderUnknown} {children} />
{/snippet}

{#each nodes as node, index (node.nodeId ?? index)}
  {@render renderNode(node)}
{/each}
