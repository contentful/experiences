<!--
  The escape hatch, and the one case props can't cover: `CardCta` is a nested
  presentational child, not a registered component, so the SDK has no props to
  auto-fill onto it. `getDesignValues()` reads the resolved design record of the
  nearest registered ancestor (the `Card`) off context, which lets the CTA tint
  itself with the card's own `color` without `Card` threading it down by hand.

  Reach for this only here or when you need design outside the render path (an
  effect, an imperative measurement). Registered components should style from
  props — see every other component in this directory.
-->
<script lang="ts" module>
  export interface CardCtaProps {
    label: string;
    url: string;
  }
</script>

<script lang="ts">
  import { getDesignValues } from '@contentful/experiences-svelte';

  let { label, url }: CardCtaProps = $props();

  const design = $derived(getDesignValues<{ color?: string }>());
  const style = $derived(
    [
      'margin-top: auto',
      'display: inline-block',
      'padding: 0.5rem 1rem',
      `background: ${design.color ?? '#111'}`,
      'color: #fff',
      'text-decoration: none',
      'border-radius: 0.25rem',
      'align-self: flex-start',
    ].join('; ')
  );
</script>

<a href={url} {style}>{label}</a>
