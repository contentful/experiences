/**
 * The components that hydrate as islands. Island props are serialized into the
 * page, so the component map can't be one of them; binding it here is how each
 * component reaches the browser. Only what's listed here ships client JS.
 */
import { createExperienceNode } from '@contentful/experiences-react/custom-renderer';

import { Card } from '../components/Card';

export const clientComponents = { card: Card };

export default createExperienceNode(clientComponents);
