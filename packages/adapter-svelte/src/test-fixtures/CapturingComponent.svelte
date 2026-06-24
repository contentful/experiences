<!--
  Test fixture: pushes its full props bag into a context-supplied capture
  array. Used by tests that need to assert what the renderer passed in.
-->
<script lang="ts">
  import type { RenderContext } from '../types.js';

  let {
    experience,
    ...rest
  }: {
    experience: RenderContext & { capture?: Array<Record<string, unknown>> };
  } & Record<string, unknown> = $props();

  // The renderer composes `experience` from `context`, which we abuse in
  // tests to smuggle in a capture array.
  const capture = (experience as unknown as { capture?: Array<Record<string, unknown>> }).capture;
  if (Array.isArray(capture)) {
    capture.push({ experience, ...rest });
  }
</script>
