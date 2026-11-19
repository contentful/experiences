<script lang="ts">
  import { untrack } from 'svelte';
  import { getRuntimeScope } from '../runtime/context.svelte.js';
  import type { ContentfulExperiences } from '@contentful/experiences-web';
  import type { RequestController } from './request-controller.svelte.js';
  import type { ManagedRequestSource } from './request-source.js';
  let { controller, source, routeKey }: { controller: RequestController; source?: ManagedRequestSource; routeKey: string } = $props();
  const scope = getRuntimeScope();
  $effect.pre(() => {
    const owner = scope.owner.current;
    const candidate = source;
    const key = routeKey;
    untrack(() => {
      controller.attach(owner.status === 'ready' ? owner.sdk as ContentfulExperiences : undefined, scope.route, scope.owner.sessionId, () => scope.source);
      void controller.update(candidate, key);
    });
  });
  let observed: { sdk: ContentfulExperiences; locale?: string; revision?: number } | undefined;
  $effect.pre(() => {
    const owner = scope.owner.current;
    const locale = scope.state.locale;
    const preview = scope.state.preview;
    untrack(() => {
      if (owner.status !== 'ready') { observed = undefined; return; }
      const sdk = owner.sdk as ContentfulExperiences;
      if (observed?.sdk === sdk) {
        if (locale !== observed.locale) controller.observeLocale();
        if (preview?.revision !== observed.revision)
          controller.refreshPreview(preview?.data?.sys?.id);
      }
      observed = { sdk, locale, revision: preview?.revision };
    });
  });
</script>
