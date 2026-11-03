import { singleAppExperiences } from '../../../single-experience-server';
import { SingleExperiencePage } from '../../../components/SingleExperiencePage';

export const dynamic = 'force-dynamic';

export default function SingleExperience() {
  const bound = singleAppExperiences();
  return (
    <bound.request.ExperiencesRoot>
      <SingleExperiencePage>
        <bound.request.Experience />
      </SingleExperiencePage>
    </bound.request.ExperiencesRoot>
  );
}
