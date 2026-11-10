import type {
  ComponentNode,
  ExperiencePayload,
  ExperienceTemplateNode,
} from '@contentful/experiences-sdk-core';

export function componentNode(
  typeId: string,
  rest: Omit<ComponentNode, 'component'> = {}
): ComponentNode {
  return {
    component: {
      sys: {
        type: 'ResourceLink',
        linkType: 'Contentful:Component',
        urn: `crn:contentful:::experience:spaces/$self/environments/$self/components/${typeId}`,
      },
    },
    ...rest,
  };
}

/**
 * A coded Experience Template is an ordinary top-level node — the only
 * difference from `componentNode` is which registry its id resolves against.
 */
export function experienceTemplateNode(
  typeId: string,
  rest: Omit<ExperienceTemplateNode, 'experienceTemplate'> = {}
): ExperienceTemplateNode {
  return {
    experienceTemplate: {
      sys: {
        type: 'ResourceLink',
        linkType: 'Contentful:ExperienceTemplate',
        urn: `crn:contentful:::experience:spaces/$self/environments/$self/experienceTemplates/${typeId}`,
      },
    },
    ...rest,
  };
}
export function slotPayload(texts: string[]): ExperiencePayload {
  return {
    nodes: [
      componentNode('container', {
        id: 'c',
        slots: {
          children: texts.map((text, index) =>
            componentNode('item', {
              id: String(index),
              contentProperties: { text },
            })
          ),
        },
      }),
    ],
  };
}
