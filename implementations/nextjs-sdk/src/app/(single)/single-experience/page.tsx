import { singleAppExperiences } from '../../../single-experience-server';
import { SingleExperiencePage } from '../../../components/SingleExperiencePage';

export const dynamic = 'force-dynamic';

export default function SingleExperience() {
  const {
    request: { ExperiencesRoot, Experience },
  } = singleAppExperiences();
  return (
    <ExperiencesRoot>
      <SingleExperiencePage>
        <Experience />
      </SingleExperiencePage>
    </ExperiencesRoot>
  );
}
