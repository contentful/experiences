/*
 * Default fallback rendered when an instance references a component type
 * not present in the Config.
 *
 * Behavior: a visible red error box in preview, silent null in production.
 * Customers can override per-render via <ExperienceRenderer renderUnknown=...>.
 */

import type { ReactNode } from 'react';

import { useExperience } from './context';

export interface MissingComponentProps {
  componentTypeId: string;
  /** Optional — only present when the payload supplied an id for this node. */
  nodeId?: string;
}

export function MissingComponent({ componentTypeId, nodeId }: MissingComponentProps): ReactNode {
  const { isPreview } = useExperience();
  if (typeof console !== 'undefined') {
    const idLabel = nodeId ? ` (nodeId: ${nodeId})` : '';
    console.warn(
      `[@contentful/experiences] No component registered for type "${componentTypeId}"${idLabel}.`
    );
  }
  if (!isPreview) return null;
  return (
    <div
      style={{
        border: '2px solid red',
        padding: '1rem',
        color: 'red',
        background: '#fff',
      }}
      data-experiences-missing={componentTypeId}
    >
      <strong>Missing component &lsquo;{componentTypeId}&rsquo;</strong>
      <p>
        This component is referenced by the Experience payload but is not registered in the Config.
      </p>
    </div>
  );
}
