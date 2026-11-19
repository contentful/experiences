import {
  defineComponent,
  defineExperienceTemplate,
  type Config,
} from '@contentful/experiences-svelte';

import { readContent, type CardProps, type TemplateProps } from '#lib/content.js';
import CodedTemplate from '#lib/components/CodedTemplate.svelte';
import RegisteredContentCard from '#lib/components/RegisteredContentCard.svelte';

export const experienceConfig: Config = {
  components: {
    codedComponent: defineComponent<CardProps>({
      resolveData: ({ content }) => readContent(content, 'codedComponent'),
      component: RegisteredContentCard,
    }),
  },
  experienceTemplates: {
    codedExperienceTemplate: defineExperienceTemplate<TemplateProps>({
      resolveData: ({ content }) => readContent(content, 'codedExperienceTemplate'),
      component: CodedTemplate,
    }),
  },
};
