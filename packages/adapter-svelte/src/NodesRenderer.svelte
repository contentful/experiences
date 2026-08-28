<!--
 * Recursive renderer over PortableRenderNodes. Customer components receive
 * the merged content / design / resolveData props plus one prop per slot,
 * each an ARRAY of Snippets — one zero-arg Snippet per pre-rendered child
 * node. A slot named `content` arrives as `content?: Snippet[]`; the
 * conventional default slot arrives as `children?: Snippet[]`. A component
 * renders them all with an each-block + @render, or maps/filters/wraps the
 * children individually. The arrays mirror the React adapter's ReactNode[]
 * slot contract; see the README for the consuming-a-slot example.
 *
 * This applies to every node kind — a coded Experience Template declaring a
 * `content` slot gets a `content` prop exactly as a component would. The raw
 * per-slot payload nodes are also reachable via
 * `getContentfulComponent().slots` for callers that want to render them
 * themselves with the exported NodesRenderer.
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
  import type { DiagnosticReporter, RenderError, RenderUnknown } from './component-props.js';
  import type { Config, RenderContext } from './types.js';

  interface NodesRendererProps {
    nodes: PortableRenderNode[];
    config: Config;
    experience: RenderContext;
    renderUnknown: RenderUnknown;
    renderError: RenderError;
    onDiagnostic: DiagnosticReporter;
  }

  let { nodes, config, experience, renderUnknown, renderError, onDiagnostic }: NodesRendererProps =
    $props();

  // Same re-run-doesn't-mean-new-occurrence problem as NodeRenderer.svelte's
  // `reportOnce` — `renderNode`'s `{@const}`s re-run per node on every
  // reactive re-render of the `{#each}` block. One Set covers every node in
  // this list since the diagnostic's own context (nodeId/slotName) already
  // makes the signature unique per node+slot.
  const reportedSlots = new Set<string>();
  function reportSlotDiagnosticOnce(error: Error): void {
    if (reportedSlots.has(error.message)) return;
    reportedSlots.add(error.message);
    onDiagnostic(error);
  }

  // Curry the parameterized `renderNode` snippet into a zero-arg Snippet bound
  // to one node: forward the anchor (the renderer, under SSR) and supply the
  // node through a getter. This is the one spot that leans on Svelte's snippet
  // calling convention; pinned by the slot-array tests in
  // server-renderer.test.ts and nodes-renderer.ssr.test.ts.
  function toChildSnippet(node: PortableRenderNode): Snippet {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- programmatic snippet construction; see note above.
    return ((anchor: unknown) => (renderNode as any)(anchor, () => node)) as Snippet;
  }

  // Svelte's two compiler outputs disagree on how snippet arguments arrive: the
  // client build passes each one as a getter, the server build passes it by
  // value. Compiler-generated `{@render}` call sites match whichever build they
  // are in, but `toChildSnippet` writes its call by hand, so the snippet body
  // accepts either shape and normalizes here.
  type NodeArg = PortableRenderNode | (() => PortableRenderNode);
  function unwrapNode(node: NodeArg): PortableRenderNode {
    return typeof node === 'function' ? node() : node;
  }

  // Build one Snippet[] per slot so every slot becomes a named prop. Snippets
  // themselves are compile-time entities, but the merged props object is
  // plain runtime data — so an unbounded set of payload-driven slot names is
  // fine as long as each snippet comes from `toChildSnippet`.
  //
  // Defensive: `node.slots[x]` is typed as an array, but a hand-built
  // PortableRenderPlan (a supported path — customers can construct one
  // directly instead of going through `resolveExperience`) is not
  // type-checked at runtime. Warn + drop rather than letting `.map` throw.
  function toSlotSnippets(
    node: PortableRenderNode,
    onDiagnosticFn: DiagnosticReporter
  ): Record<string, Snippet[]> {
    const slotSnippets: Record<string, Snippet[]> = {};
    for (const [slotName, children] of Object.entries(node.slots)) {
      if (!Array.isArray(children)) {
        const { kind, id } = node.registration;
        const message =
          `Slot "${slotName}" on ${kind} "${id}"${node.nodeId ? ` (node "${node.nodeId}")` : ''} ` +
          `is not an array of nodes; rendering it as empty instead of throwing.`;
        if (typeof console !== 'undefined') {
          console.warn(`[@contentful/experiences-svelte] ${message}`);
        }
        onDiagnosticFn(new Error(message));
        slotSnippets[slotName] = [];
        continue;
      }
      slotSnippets[slotName] = children.map(toChildSnippet);
    }
    return slotSnippets;
  }
</script>

{#snippet renderNode(nodeArg: NodeArg)}
  {@const node = unwrapNode(nodeArg)}
  {@const slotSnippets = toSlotSnippets(node, reportSlotDiagnosticOnce)}
  <NodeRenderer
    {node}
    {config}
    {experience}
    {renderUnknown}
    {renderError}
    {onDiagnostic}
    {slotSnippets}
  />
{/snippet}

{#each nodes as node, index (node.nodeId ?? index)}
  {@render renderNode(node)}
{/each}
