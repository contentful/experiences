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
  import type { RenderUnknown } from './component-props.js';
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
    /**
     * Pre-rendered slot children keyed by slot name — one zero-arg Snippet per
     * child node. Spread onto the customer component as named props, so a slot
     * named `content` arrives as a `content` prop. `children` is not special.
     */
    slotSnippets: Record<string, Snippet[]>;
  }

  let { node, config, experience, renderUnknown, slotSnippets }: NodeRendererProps = $props();

  const { kind, id } = node.registration;
  const isExperienceTemplate = kind === 'experienceTemplate';

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
    if (typeof console !== 'undefined') {
      console.warn(
        `[@contentful/experiences-svelte] No experience template registered for id "${id}". Rendering its slot children without the experience template wrapper.`
      );
    }
    return Object.values(slotSnippets).flat();
  });
</script>

{#if componentConfig && composed}
  {@const Cmp = componentConfig.component}
  <Cmp {...composed} />
{:else if orphanedSnippets}
  {#each orphanedSnippets as childSnippet, index (index)}
    {@render childSnippet()}
  {/each}
{:else}
  {@const Unknown = renderUnknown}
  <Unknown
    componentId={id}
    nodeId={node.nodeId}
  />
{/if}
