/*
 * First-party debug panel. Renders the resolved Experience plan as pretty
 * JSON so a customer can see exactly what the SDK interpreted from the payload
 * — node tree, registrations, resolved props, viewports.
 *
 * Two ways to use it:
 *  - Auto-mounted by the renderers when `debug` is on (above the tree).
 *  - Mounted manually anywhere: `<DebugExperience experience={plan} />`.
 *
 * v1 is just the JSON dump wrapped in a native <details> so it collapses
 * without any client JS (safe in server components). Room to grow into a
 * node-tree explorer, viewport indicator, and resolveData timing panel — kept
 * deliberately small for now.
 *
 * No React hooks here on purpose: it must render in both server and client
 * renderer subtrees.
 */

import type { ReactNode } from 'react';

import type { PortableRenderPlan } from '@contentful/experiences-sdk-core';

export interface DebugExperienceProps {
  /** The resolved plan to inspect (what a renderer receives as `experience`). */
  experience: PortableRenderPlan;
  /** Start expanded. Defaults to collapsed to stay out of the way. */
  defaultOpen?: boolean;
}

export function DebugExperience({
  experience,
  defaultOpen = false,
}: DebugExperienceProps): ReactNode {
  const nodeCount = experience.nodes.length;
  // Coded Experience Templates are ordinary top-level nodes, so name them from
  // the node list — a composite Experience simply has none to report.
  const templateIds = experience.nodes
    .filter((node) => node.registration.kind === 'experienceTemplate')
    .map((node) => node.registration.id);
  const summary = `Experience debug — ${nodeCount} top-level node${nodeCount === 1 ? '' : 's'}${
    templateIds.length
      ? `, experience template${templateIds.length === 1 ? '' : 's'}: ${templateIds.join(', ')}`
      : ''
  }`;

  return (
    <details
      open={defaultOpen}
      data-experiences-debug
      style={{
        margin: '1rem 0',
        border: '1px solid #6b7280',
        borderRadius: '6px',
        background: '#0b1021',
        color: '#e2e8f0',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: '0.75rem',
        overflow: 'hidden',
      }}
    >
      <summary
        style={{
          cursor: 'pointer',
          padding: '0.5rem 0.75rem',
          background: '#111827',
          userSelect: 'none',
        }}
      >
        {summary}
      </summary>
      <pre
        style={{
          margin: 0,
          padding: '0.75rem',
          overflow: 'auto',
          maxHeight: '32rem',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {safeStringify(experience)}
      </pre>
    </details>
  );
}

/**
 * JSON.stringify with a circular-reference guard. A resolved plan is plain
 * data, but a customer's `resolveData` could stash a non-serializable value on
 * `props.resolved` — degrade to a placeholder rather than throwing inside a
 * debug panel.
 */
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
