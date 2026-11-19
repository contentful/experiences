import { createExperiencesContextHandler } from '@contentful/experiences-nextjs/request-handler';

// Sanitize and forward the real request URL; loading stays in the page binding.
export const middleware = createExperiencesContextHandler();
export const config = {
  runtime: 'nodejs',
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
