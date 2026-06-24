<script lang="ts">
  let { value }: { value?: string } = $props();
</script>

<span data-value={value}>{value}</span>
