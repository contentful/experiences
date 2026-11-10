import type { PortableRenderPlan } from '@contentful/experiences-node';

export function plan(metadata: PortableRenderPlan['metadata'] = {}): PortableRenderPlan {
  return { nodes: [], debug: false, diagnostics: [], metadata };
}
