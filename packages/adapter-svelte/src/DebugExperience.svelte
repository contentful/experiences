<!--
 * First-party debug panel. Renders the resolved Experience plan as pretty
 * JSON so a customer can see exactly what the SDK interpreted from the payload
 * — node tree, registrations, resolved props, viewports.
 *
 * Two ways to use it:
 *  - Auto-mounted by the renderers when `debug` is on (above the tree).
 *  - Mounted manually anywhere: `<DebugExperience experience={plan} />`.
 *
 * v1 is just the JSON dump wrapped in a native <details> so it collapses
 * without any extra JS. Room to grow into a node-tree explorer, viewport
 * indicator, and resolveData timing panel — kept deliberately small for now.
-->
<script lang="ts">
  import type { DebugExperienceProps } from './component-props.js';

  let { experience, defaultOpen = false }: DebugExperienceProps = $props();

  const nodeCount = $derived(experience.nodes.length);
  const summary = $derived(
    `Experience debug — ${nodeCount} top-level node${nodeCount === 1 ? '' : 's'}${
      experience.experienceTemplate
        ? `, experience template: ${experience.experienceTemplate.experienceTemplateId}`
        : ''
    }`
  );

  // JSON.stringify with a circular-reference guard: a customer's resolveData
  // could stash a non-serializable value on props.resolved — degrade to a
  // placeholder rather than throwing inside a debug panel.
  function safeStringify(value: unknown): string {
    const seen = new WeakSet<object>();
    try {
      return JSON.stringify(
        value,
        (_key, val) => {
          if (typeof val === 'object' && val !== null) {
            if (seen.has(val)) return '[Circular]';
            seen.add(val);
          }
          if (typeof val === 'function') return `[Function ${val.name || 'anonymous'}]`;
          if (typeof val === 'undefined') return '[undefined]';
          return val;
        },
        2
      );
    } catch (err) {
      return `[DebugExperience: could not serialize plan — ${(err as Error).message}]`;
    }
  }

  const json = $derived(safeStringify(experience));
</script>

<details
  open={defaultOpen}
  data-experiences-debug
  style="margin: 1rem 0; border: 1px solid #6b7280; border-radius: 6px; background: #0b1021; color: #e2e8f0; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.75rem; overflow: hidden;"
>
  <summary
    style="cursor: pointer; padding: 0.5rem 0.75rem; background: #111827; user-select: none;"
  >
    {summary}
  </summary>
  <pre
    style="margin: 0; padding: 0.75rem; overflow: auto; max-height: 32rem; white-space: pre-wrap; word-break: break-word;">{json}</pre>
</details>
