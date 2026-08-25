/*
 * Default fallback rendered when a registered component throws while
 * rendering. Sibling of `MissingComponent` — same debug-gated behavior
 * (visible box in debug mode, silent null otherwise), visually distinct
 * (different color/label) so a customer can tell "not registered" apart from
 * "registered but threw" at a glance. The diagnostic + console.warn for this
 * failure mode are recorded once, at the error-boundary call site in
 * `nodes-renderer.tsx` — not here — so they still fire even when a customer
 * overrides `renderError` with their own fallback.
 */
'use client';

import type { ReactNode } from 'react';

import { useExperience } from './context';

export interface ComponentErrorProps {
  componentId: string;
  /** Optional — only present when the payload supplied an id for this node. */
  nodeId?: string;
  /** The caught error's message, when available. */
  message?: string;
}

export function ComponentError({ componentId, nodeId, message }: ComponentErrorProps): ReactNode {
  const { debug } = useExperience();
  if (!debug) return null;
  return (
    <div
      style={{
        border: '2px solid #b91c1c',
        padding: '1rem',
        color: '#b91c1c',
        background: '#fff',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: '0.8125rem',
      }}
      data-experiences-render-error={componentId}
    >
      <strong>Component &lsquo;{componentId}&rsquo; threw while rendering</strong>
      <p style={{ margin: '0.5rem 0' }}>
        This component is registered but threw during render. Rendering this fallback instead of
        crashing the surrounding tree.
      </p>
      <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
        {JSON.stringify({ componentId, nodeId: nodeId ?? null, message: message ?? null }, null, 2)}
      </pre>
    </div>
  );
}
