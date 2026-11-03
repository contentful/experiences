'use client';

import { useContentfulComponent, type Config } from '@contentful/experiences-nextjs/client';
import { ContentCard, CodedTemplate, type CardProps } from './ExperienceContent';

function RegisteredCard(props: CardProps) {
  const component = useContentfulComponent();
  const clickable = component?.attribution?.roots.some(
    (scope) => scope.entityKind === 'ExperienceFragment'
  );
  return <ContentCard {...props} data-ctfl-clickable={clickable ? true : undefined} />;
}

export const browserRegistry: Config = {
  components: { codedComponent: RegisteredCard },
  experienceTemplates: { codedExperienceTemplate: CodedTemplate },
};
