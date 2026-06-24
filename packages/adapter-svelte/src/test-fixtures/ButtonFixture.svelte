<script lang="ts">
  let {
    label,
    cfBackgroundColor,
  }: {
    label?: string;
    cfBackgroundColor?: string;
  } = $props();
</script>

<button type="button" data-bg={cfBackgroundColor}>{label}</button>
