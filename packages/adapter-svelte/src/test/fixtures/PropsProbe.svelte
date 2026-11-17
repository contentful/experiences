<script lang="ts">
  import { getExperience, getContentfulComponent } from '../../rendering/context.js';
  import { getDesignValues } from '../../hooks/get-design-values.js';

  const props = $props();
  const experience = getExperience();
  const contentful = getContentfulComponent();
</script>

<span
  data-props={JSON.stringify(props)}
  data-prop-keys={JSON.stringify(Object.keys(props).sort())}
  data-experience={JSON.stringify(experience)}
  data-contentful={JSON.stringify(contentful ?? null)}
  data-design={JSON.stringify(getDesignValues())}
  data-scopes
  data-json={JSON.stringify(contentful?.attribution ?? null)}
  data-value={props.value as string}
>{contentful?.attribution?.scopes.map((scope) => scope.entityId).join(',') ??
    props.value ??
    ''}</span
>
