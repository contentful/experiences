<!--
 * Single-node renderer. Splits out of NodesRenderer so the per-node
 * `setContext` for the contentful payload happens during *that node's*
 * component init (Svelte's setContext can only be called at top level).
 *
 * A node's `registration.kind` picks which half of the customer Config owns
 * its implementation — `experienceTemplates` for a coded Experience Template,
 * `components` otherwise. Everything else (slot props, merge precedence,
 * design resolution) is identical across the two kinds.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';

  import type { PortableRenderNode } from '@contentful/experiences-sdk-core';
  import { selectResolvedDesign } from '@contentful/experiences-design';

  import {
    setContentfulComponent,
    setContentfulExperienceTemplate,
    setResolvedDesign,
  } from './context.js';
  import type { DiagnosticReporter, RenderError, RenderUnknown } from './component-props.js';
  import {
    normalizeComponentRegistration,
    normalizeExperienceTemplateRegistration,
    type ContentfulComponent,
    type ContentfulExperienceTemplate,
    type Config,
    type RenderContext,
  } from './types.js';

  interface NodeRendererProps {
    node: PortableRenderNode;
    config: Config;
    experience: RenderContext;
    renderUnknown: RenderUnknown;
    renderError: RenderError;
    onDiagnostic: DiagnosticReporter;
    /**
     * Pre-rendered slot children keyed by slot name — one zero-arg Snippet per
     * child node. Spread onto the customer component as named props, so a slot
     * named `content` arrives as a `content` prop. `children` is not special.
     */
    slotSnippets: Record<string, Snippet[]>;
  }

  let {
    node,
    config,
    experience,
    renderUnknown,
    renderError,
    onDiagnostic,
    slotSnippets,
  }: NodeRendererProps = $props();

  const { kind, id } = node.registration;
  const isExperienceTemplate = kind === 'experienceTemplate';

  // Any reactive re-run of this component's `$derived`/`{@const}` blocks
  // (e.g. an ancestor's viewport change) would otherwise re-report the same
  // diagnostic every time — matches Angular's `lastDiagnostics` guard in
  // NodeRenderEngine and React's equivalent in NodeRenderer. `reported` is a
  // plain (non-reactive) binding, stable for this component instance's
  // lifetime — mutating it doesn't itself trigger reactivity, it's purely a
  // guard for calls this component makes.
  const reported = new Set<string>();
  function reportOnce(error: Error): void {
    if (reported.has(error.message)) return;
    reported.add(error.message);
    onDiagnostic(error);
  }

  const entry = $derived(
    isExperienceTemplate ? config.experienceTemplates?.[id] : config.components[id]
  );
  const componentConfig = $derived.by(() => {
    if (!entry) return null;
    return isExperienceTemplate
      ? normalizeExperienceTemplateRegistration(entry)
      : normalizeComponentRegistration(entry);
  });

  if (isExperienceTemplate) {
    const contentful: ContentfulExperienceTemplate = {
      experienceTemplateId: id,
      nodeId: node.nodeId,
      content: node.props.content,
      design: node.props.designRaw,
      resolved: node.props.resolved,
    };
    setContentfulExperienceTemplate(contentful);
  } else {
    const contentful: ContentfulComponent = {
      componentId: id,
      nodeId: node.nodeId,
      content: node.props.content,
      design: node.props.designRaw,
      resolved: node.props.resolved,
      slots: node.slots,
    };
    setContentfulComponent(contentful);
  }

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
        `[@contentful/experiences-svelte] resolveToken returned undefined for token id(s) on ${kind} "${id}": ${unresolved.join(', ')}. getDesignValues() will omit those keys.`
      );
    }
    return props;
  });

  setResolvedDesign(() => tokenResolvedDesign);

  // Merge precedence (last wins): defaults < design < content < resolveData < slots.
  const composed = $derived.by(() => {
    if (!componentConfig) return null;
    return {
      ...componentConfig.defaults,
      ...tokenResolvedDesign,
      ...node.props.content,
      ...node.props.resolved,
      ...slotSnippets,
    };
  });

  // An unregistered Experience Template would blank the page if we swapped it
  // for the missing-component box, so warn and render its slot children
  // unwrapped — the content survives, the diagnostic names what's missing.
  const orphanedSnippets = $derived.by(() => {
    if (componentConfig || !isExperienceTemplate) return null;
    const message = `No experience template registered for id "${id}". Rendering its slot children without the experience template wrapper.`;
    if (typeof console !== 'undefined') {
      console.warn(`[@contentful/experiences-svelte] ${message}`);
    }
    reportOnce(new Error(message));
    return Object.values(slotSnippets).flat();
  });

  // `MissingComponent` (the default `renderUnknown`) does its own
  // console.warn via an `$effect`; a custom override may not, so the
  // diagnostic is recorded here regardless of which fallback ends up
  // rendering.
  function reportMissingComponent(): true {
    const message = `No component registered for id "${id}"${node.nodeId ? ` (nodeId: ${node.nodeId})` : ''}.`;
    reportOnce(new Error(message));
    return true;
  }

  // Reported from `<svelte:boundary onerror={...}>` when the customer's
  // component throws during render. See the README's error-handling section
  // for the SSR/CSR asymmetry: `<svelte:boundary>` only catches client-side —
  // a throw during SvelteKit's server render still fails the whole render.
  function reportRenderError(error: unknown): void {
    const reason = error instanceof Error ? error.message : String(error);
    const message =
      `Component "${id}" (${kind}${node.nodeId ? `, node "${node.nodeId}"` : ''}) threw while ` +
      `rendering: ${reason}. Rendering the error fallback instead of crashing the surrounding tree.`;
    if (typeof console !== 'undefined') {
      console.warn(`[@contentful/experiences-svelte] ${message}`);
    }
    onDiagnostic(new Error(message, { cause: error instanceof Error ? error : undefined }));
  }
</script>

{#if componentConfig && composed}
  {@const Cmp = componentConfig.component}
  {@const ErrorFallback = renderError}
  <svelte:boundary onerror={(error) => reportRenderError(error)}>
    <Cmp {...composed} />
    {#snippet failed()}
      <ErrorFallback componentId={id} nodeId={node.nodeId} />
    {/snippet}
  </svelte:boundary>
{:else if orphanedSnippets}
  {#each orphanedSnippets as childSnippet, index (index)}
    {@render childSnippet()}
  {/each}
{:else}
  {@const _reported = reportMissingComponent()}
  {@const Unknown = renderUnknown}
  <Unknown
    componentId={id}
    nodeId={node.nodeId}
  />
{/if}
