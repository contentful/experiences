<script lang="ts">
  let {
    text,
    cfFontSize,
  }: {
    text?: string;
    cfFontSize?: string;
  } = $props();
</script>

<h1 data-font-size={cfFontSize}>{text}</h1>
