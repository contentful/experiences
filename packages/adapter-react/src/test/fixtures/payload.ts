import type {
  ComponentNode,
  ExperienceTemplateNode,
  ExperiencePayload,
  PortableRenderNode,
  ManualDesignValue,
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

export function sysWithExperienceTemplate(typeId: string): ExperiencePayload['sys'] {
  return {
    experienceTemplate: {
      sys: {
        type: 'ResourceLink',
        linkType: 'Contentful:ExperienceTemplate',
        urn: `crn:contentful:::experience:spaces/$self/environments/$self/experienceTemplates/${typeId}`,
      },
    },
  };
}

export function templateNodeOf(plan: { nodes: PortableRenderNode[] }): PortableRenderNode {
  const found = plan.nodes.find((n) => n.registration.kind === 'experienceTemplate');
  if (!found) throw new Error('expected an experienceTemplate node in the plan');
  return found;
}

export const m = (value: string): ManualDesignValue => ({ type: 'ManualDesignValue', value });
export const dt = (value: string) => ({ type: 'DesignToken' as const, value });
