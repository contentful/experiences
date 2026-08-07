/*
 * Default fallback rendered when an instance references a component
 * not present in the Config.
 *
 * Behavior: a visible debug box when `debug` is on, silent null otherwise.
 * The console.warn fires either way so the miss is never fully silent.
 * Customers can override per-render via <ExperienceRenderer renderUnknown=...>.
 */
'use client';

import type { ReactNode } from 'react';

import { useExperience } from './context';

export interface MissingComponentProps {
  componentId: string;
  /** Optional — only present when the payload supplied an id for this node. */
  nodeId?: string;
}

export function MissingComponent({ componentId, nodeId }: MissingComponentProps): ReactNode {
  const { debug } = useExperience();
  if (typeof console !== 'undefined') {
    const idLabel = nodeId ? ` (nodeId: ${nodeId})` : '';
    console.warn(
      `[@contentful/experiences] No component registered for id "${componentId}"${idLabel}.`
    );
  }
  if (!debug) return null;
  // In debug mode the fallback is richer than a bare red box: it surfaces the
  // exact registration the customer needs to add (componentId) and the
  // node id so a miss in a large tree is locatable.
  return (
    <div
      style={{
        border: '2px solid red',
        padding: '1rem',
        color: 'red',
        background: '#fff',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: '0.8125rem',
      }}
      data-experiences-missing={componentId}
    >
      <strong>Missing component &lsquo;{componentId}&rsquo;</strong>
      <p style={{ margin: '0.5rem 0' }}>
        This component is referenced by the Experience payload but is not registered in the Config.
        Register it under this key in your <code>components</code> map:
      </p>
      <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
        {JSON.stringify({ componentId, nodeId: nodeId ?? null }, null, 2)}
      </pre>
    </div>
  );
}
