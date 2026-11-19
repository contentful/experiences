<script lang="ts">
  import ReferencePage from '#lib/components/ReferencePage.svelte';
  let { data } = $props();
</script>
<ReferencePage reference={data.reference} comparisons={data.comparisons} />
