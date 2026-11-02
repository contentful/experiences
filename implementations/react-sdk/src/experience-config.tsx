'use client';

import {
  defineComponent,
  defineExperienceTemplate,
  useContentfulComponent,
  type Config,
} from '@contentful/experiences-react/client';
import { forwardRef } from 'react';
import {
  ContentCard,
  CodedTemplate,
  readContent,
  type CardProps,
  type TemplateProps,
} from './Content';

// Registration-specific Fragment clickability stays outside the design-system card.
const RegisteredContentCard = forwardRef<HTMLElement, CardProps>(
  function RegisteredContentCard(props, ref) {
    const component = useContentfulComponent();
    const clickable = component?.attribution?.roots.some(
      (scope) => scope.entityKind === 'ExperienceFragment'
    );
    return <ContentCard data-ctfl-clickable={clickable ? true : undefined} {...props} ref={ref} />;
  }
);

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
