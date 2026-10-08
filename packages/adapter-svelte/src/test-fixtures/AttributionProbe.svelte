<!--
  Test fixture: renders the enclosing node's attributed scope ids from
  `getContentfulComponent()`. Read in the template so the value is reactive.
-->
<script lang="ts">
  import { getContentfulComponent } from '../context.js';

  const contentful = getContentfulComponent();
</script>

<span data-scopes data-json={JSON.stringify(contentful?.attribution ?? null)}
  >{contentful?.attribution?.scopes.map((s) => s.entityId).join(',') ?? ''}</span
>
