<!--
 * Wraps the rendered Experience nodes with the page-level template when the
 * plan carries one and the customer registered a template config under that
 * id. When the template is referenced but unregistered, warns once and
 * renders children unwrapped — graceful degradation matches the
 * unknown-component fallback story.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';

  import type { PortableTemplate } from '@contentful/experiences-sdk-core';

  import { setContentfulTemplate, setResolvedDesign } from './context.js';
  import { selectResolvedDesign } from './design-utils.js';
  import {
    normalizeTemplateRegistration,
    type ContentfulTemplate,
    type Config,
    type RenderContext,
  } from './types.js';

  interface WrapWithTemplateProps {
    template: PortableTemplate | undefined;
    config: Config;
    experience: RenderContext;
    children: Snippet;
  }

  let { template, config, experience, children }: WrapWithTemplateProps = $props();

  // setContext must run during synchronous component init — call once with
  // the initial template value (templates don't toggle on/off mid-mount).
  if (template) {
    setContentfulTemplate({
      templateId: template.templateId,
      content: template.props.content,
      design: template.props.designRaw,
      resolved: template.props.resolved,
    } satisfies ContentfulTemplate);
  }

  const entry = $derived(template ? config.templates?.[template.templateId] : undefined);
  const templateConfig = $derived(entry ? normalizeTemplateRegistration(entry) : null);

  const tokenResolvedDesign = $derived.by(() => {
    if (!template) return {};
    const { props, unresolved } = selectResolvedDesign(
      template.props,
      experience.viewports,
      experience.activeViewportIndex,
      experience.fallbackViewportIndex,
      config.resolveToken
    );
    if (unresolved.length && typeof console !== 'undefined') {
      console.warn(
        `[@contentful/experiences-svelte] resolveToken returned undefined for token id(s) on template "${template.templateId}": ${unresolved.join(', ')}. getDesignValues() will omit those keys.`
      );
    }
    return props;
  });

  // A getter (not a snapshot) so getDesignValues() stays reactive.
  setResolvedDesign(() => tokenResolvedDesign);

  // Same precedence as component nodes.
  const composed = $derived.by(() => {
    if (!template || !templateConfig) return null;
    return {
      ...templateConfig.defaults,
      ...tokenResolvedDesign,
      ...template.props.content,
      ...template.props.resolved,
    };
  });

  $effect(() => {
    if (template && !templateConfig && typeof console !== 'undefined') {
      console.warn(
        `[@contentful/experiences-svelte] No template registered for id "${template.templateId}". Rendering nodes without the template wrapper.`
      );
    }
  });
</script>

{#if template && templateConfig && composed}
  {@const Tpl = templateConfig.component}
  <Tpl {...composed} {children} />
{:else}
  {@render children()}
{/if}
