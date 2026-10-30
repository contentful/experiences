<!--
  Two routes, read straight off `location` so the example has no router
  dependency; swap in a router in a real app; nothing SDK-related changes:
  - `/experiences/:id` fetches one Experience by id.
  - Every other path, including `/`, is a Destination path.
  Vite's dev and preview servers fall back to `index.html` for unknown paths,
  so deep links work.
-->
<script lang="ts">
  import ExperiencePage from './ExperiencePage.svelte';

  const byId = /^\/experiences\/([^/]+)\/?$/.exec(window.location.pathname);
  const experienceId = byId ? decodeURIComponent(byId[1] ?? '') : undefined;
  const destinationPath = byId ? undefined : window.location.pathname;
  const query = new URLSearchParams(window.location.search);
  const locale = query.get('locale') ?? 'en-US';
  const debug = query.get('debug') === 'true' || query.get('debug') === '1';
</script>

<ExperiencePage {destinationPath} {experienceId} {locale} {debug} />
