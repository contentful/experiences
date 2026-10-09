import { env } from '$env/dynamic/private';

import type { LayoutServerLoad } from './$types.js';

// The consent panel creates the Web runtime in the browser, so it needs the
// space and a delivery token there. The token is sent to every visitor: use a
// read-only delivery token. The panel only sends events and never fetches.
export const load: LayoutServerLoad = () => ({
  consent: {
    spaceId: env.SPACE_ID ?? '',
    environmentId: env.ENVIRONMENT_ID || 'master',
    accessToken: env.CDA_TOKEN ?? '',
  },
});
