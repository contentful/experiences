import type { PortableRenderNode } from '@contentful/experiences-sdk-core';

export function planNode(
  kind: 'component' | 'experienceTemplate',
  id: string,
  props: Partial<PortableRenderNode['props']> = {},
  rest: Partial<PortableRenderNode> = {}
): PortableRenderNode {
  return {
    registration: { kind, id },
    props: { content: {}, design: {}, designRaw: {}, ...props },
    slots: {},
    ...rest,
  };
}
