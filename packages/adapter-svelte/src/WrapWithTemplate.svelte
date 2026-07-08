<!--
 * Wraps the rendered Experience nodes with the page-level template when the
 * plan carries one and the customer registered a template config under that
 * id. When the template is referenced but unregistered, warns once and
 * renders children unwrapped — graceful degradation matches the
 * unknown-component fallback story.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';

  import type { PortableTemplate } from '@contentful/experiences-core';
  import { resolveDesignProperties } from '@contentful/experiences-design';

  import { setContentfulTemplate } from './context.js';
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
      design: template.props.design,
      resolved: template.props.resolved,
    } satisfies ContentfulTemplate);
  }

  const entry = $derived(template ? config.templates?.[template.templateId] : undefined);
  const templateConfig = $derived(entry ? normalizeTemplateRegistration(entry) : null);

  $effect(() => {
    if (template && !templateConfig && typeof console !== 'undefined') {
      console.warn(
        `[@contentful/experiences-svelte] No template registered for id "${template.templateId}". Rendering nodes without the template wrapper.`
      );
    }
  });
</script>

{#if template && templateConfig}
  {@const Tpl = templateConfig.component}
  {@const resolvedDesign = resolveDesignProperties(
    template.props.design,
    experience.viewports,
    experience.activeViewportIndex
  )}
  {@const composed = {
    ...templateConfig.defaults,
    ...template.props.content,
    ...resolvedDesign,
    ...template.props.resolved,
  }}
  <Tpl {...composed} {children} />
{:else}
  {@render children()}
{/if}
