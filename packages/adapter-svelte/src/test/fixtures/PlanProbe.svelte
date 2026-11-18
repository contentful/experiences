<script lang="ts" generics="Options">
  import { untrack } from 'svelte';
  import type { PortableRenderPlan } from '@contentful/experiences-sdk-core';
  let { options, use }: {
    options: Options;
    use: (getOptions: () => Options) => { readonly data: PortableRenderPlan | undefined };
  } = $props();
  const plan = untrack(() => use(() => options));
</script>

<output>{plan.data?.nodes[0]?.props.content.title ?? ''}</output>
