<!--
  Compact card: image + title + teaser + CTA. Content properties come from
  a `Card from Promotion` DataAssembly binding. The card itself styles from
  props, like every other component here.

  This directory's one demonstration of the `getDesignValues()` escape hatch
  lives in the nested `CardCta.svelte`.
-->
<script lang="ts" module>
  import type { HTMLAttributes } from 'svelte/elements';

  export interface CardProps extends Omit<HTMLAttributes<HTMLElement>, 'children'> {
    title?: string;
    teaser?: string;
    ctaLabel?: string;
    ctaUrl?: string;
    image?: string;
    // Design properties, auto-filled as props.
    backgroundColor?: string;
    color?: string;
  }
</script>

<script lang="ts">
  import CardCta from './CardCta.svelte';

  let {
    title,
    teaser,
    ctaLabel,
    ctaUrl,
    image,
    backgroundColor,
    color,
    style: callerStyle,
    ...rootProps
  }: CardProps = $props();

  const style = $derived(
    [
      'display: flex',
      'flex-direction: column',
      'border-radius: 0.5rem',
      'overflow: hidden',
      'box-shadow: 0 1px 3px rgba(0,0,0,0.08)',
      backgroundColor && `background: ${backgroundColor}`,
      color && `color: ${color}`,
      callerStyle,
    ]
      .filter(Boolean)
      .join('; ')
  );
</script>

<article {...rootProps} {style}>
  {#if image}
    <img src={image} alt="" style="width: 100%; height: 180px; object-fit: cover;" />
  {/if}
  <div style="padding: 1rem 1.25rem; display: flex; flex-direction: column; gap: 0.75rem; flex: 1;">
    {#if title}
      <h3 style="margin: 0; font-size: 1.25rem;">{title}</h3>
    {/if}
    {#if teaser}
      <p style="margin: 0; line-height: 1.5;">{teaser}</p>
    {/if}
    {#if ctaLabel && ctaUrl}
      <CardCta label={ctaLabel} url={ctaUrl} />
    {/if}
  </div>
</article>
