<script lang="ts">
  let {
    variant,
    priority,
  }: {
    variant?: string;
    priority?: string;
  } = $props();
</script>

<span data-variant={variant} data-priority={priority}></span>
