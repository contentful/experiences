import { createExperiencesContextHandler } from '@contentful/experiences-nextjs/request-handler';

// The public request-handler entry is Node-only. Context forwarding initializes
// no SDK and performs no page/profile work; final identity belongs to writable responses.
export const middleware = createExperiencesContextHandler();
export const config = {
  runtime: 'nodejs',
  matcher: [
    '/',
    '/page-two',
    '/pages',
    '/pages/page-two',
    '/single-experience',
    '/pages/single-experience',
  ],
};
