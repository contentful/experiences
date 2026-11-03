import type { GetServerSideProps } from 'next';
import type { NextjsRequestResult } from '@contentful/experiences-nextjs/pages-router/server';
import type { BrowserEnvironment } from '../../reference';
import { getServer } from '../../config';
import { singlePagesExperiences } from '../../single-experience-server';
import { PagesSingleExperience } from '../../components/SingleExperience';
import { SingleExperiencePage } from '../../components/SingleExperiencePage';

export interface SingleExperienceProps {
  singleExperience: true;
  environment: BrowserEnvironment;
  experiences: NextjsRequestResult;
}

export const getServerSideProps: GetServerSideProps<SingleExperienceProps> = async (context) => ({
  props: {
    singleExperience: true,
    environment: getServer().browser,
    experiences: await singlePagesExperiences().request.loadExperience(context),
  },
});

export default function SingleExperience({ experiences }: SingleExperienceProps) {
  return (
    <SingleExperiencePage pages>
      <PagesSingleExperience result={experiences} />
    </SingleExperiencePage>
  );
}
