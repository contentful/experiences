import { createServer } from 'node:http';

import { ContentfulExperiences } from '@contentful/experiences-node';

import { hasServerConsent, identitySetCookie, readIdentity } from './identity-cookie.js';

/**
 * A server using the Node SDK with the identity cookie, written against plain `node:http`
 * so the same code fits any framework: parse a header, build a request, set a header.
 *
 * Run it with SPACE_ID and CDA_TOKEN set (see the README).
 */
const sdk = new ContentfulExperiences({
  spaceId: process.env.SPACE_ID ?? '',
  environmentId: process.env.ENVIRONMENT_ID ?? 'master',
  delivery: { accessToken: process.env.CDA_TOKEN ?? '' },
});

const server = createServer((req, res) => {
  res.setHeader('Cache-Control', 'private, no-store');
  void (async () => {
    const identity = readIdentity(req.headers.cookie);
    const granted = hasServerConsent(req.headers.cookie);

    const request = sdk.forRequest({
      locale: 'en-US',
      profile: identity === undefined ? undefined : { id: identity },
      consent: { events: granted, persistence: granted },
    });

    try {
      // Send one page event and retain the response identity on this request only.
      await request.page();

      const profileId = request.profile?.id;
      const setCookie = identitySetCookie({
        isPreview: request.isPreview,
        canPersistProfile: request.canPersistProfile,
        profileId,
        hadCookie: identity !== undefined,
      });
      if (setCookie) res.setHeader('Set-Cookie', setCookie);

      // Return only the identity for this demo; keep visitor responses private.
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ identity: profileId ?? null }));
    } finally {
      request.destroy();
    }
  })().catch((error: unknown) => {
    res.statusCode = 500;
    res.end(error instanceof Error ? error.message : 'error');
  });
});

const port = Number(process.env.PORT ?? 4100);
server.listen(port, () => {
  console.warn(`Node identity-cookie example listening on http://localhost:${port}`);
});
