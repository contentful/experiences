import type {
  ComponentNode,
  ExperiencePayload,
  ExperienceTemplateNode,
  ManualDesignValue,
} from '@contentful/experiences-sdk-core';

export const m = (value: string): ManualDesignValue => ({ type: 'ManualDesignValue', value });

export const dt = (value: string) => ({ type: 'DesignToken' as const, value });

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

/**
 * `sys.experienceTemplate` rides along on every Experience — coded and
 * composite alike — so it must never influence rendering. Tests attach it to
 * prove it is ignored.
 */
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
