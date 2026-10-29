<script lang="ts" module>
  export interface TextProps {
    text?: string;
    // Design properties, auto-filled as props.
    align?: string;
    fontSize?: string;
  }
</script>

<script lang="ts">
  let { text, align, fontSize = '16px' }: TextProps = $props();

  const style = $derived(
    [
      `font-size: ${fontSize}`,
      'line-height: 1.5',
      'color: #4b5563',
      'margin: 0',
      align && `text-align: ${align}`,
    ]
      .filter(Boolean)
      .join('; ')
  );
</script>

<p {style}>{text ?? ''}</p>
