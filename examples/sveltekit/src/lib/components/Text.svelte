<script lang="ts" module>
  import type { HTMLAttributes } from 'svelte/elements';

  export interface TextProps extends Omit<HTMLAttributes<HTMLElement>, 'children'> {
    text?: string;
    // Design properties, auto-filled as props.
    align?: string;
    fontSize?: string;
  }
</script>

<script lang="ts">
  let { text, align, fontSize = '16px', style: callerStyle, ...rootProps }: TextProps = $props();

  const style = $derived(
    [
      `font-size: ${fontSize}`,
      'line-height: 1.5',
      'color: #4b5563',
      'margin: 0',
      align && `text-align: ${align}`,
      callerStyle,
    ]
      .filter(Boolean)
      .join('; ')
  );
</script>

<p {...rootProps} {style}>{text ?? ''}</p>
