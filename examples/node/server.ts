import { createServer } from 'node:http';

import { ContentfulExperiences } from '@contentful/experiences-node';

import { identitySetCookie, readIdentity } from './identity-cookie.js';

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

/**
 * Whether this application may keep the visitor's identity. It has to come from the
 * application: your own consent record, a session, a CMP token. The identity cookie being
 * present proves nothing about consent, and neither does anything in the browser's storage.
 * This example reads a cookie of its own to show where that decision belongs.
 */
function hasServerConsent(cookieHeader: string | undefined): boolean {
  return cookieHeader?.split('; ').includes('app-personalization-consent=granted') ?? false;
}

const server = createServer((req, res) => {
  void (async () => {
    const identity = readIdentity(req.headers.cookie);
    const granted = hasServerConsent(req.headers.cookie);

    const request = sdk.forRequest({
      locale: 'en-US',
      profile: identity === undefined ? undefined : { id: identity },
      consent: { events: granted, persistence: granted },
    });

    // One preview of the page event for this visitor. The handoff it returns carries the
    // identity on to the browser, which continues it.
    const { handoff } = await request.prepareRequestHandoff({ routeKey: req.url ?? '/' });

    // The cookie holds the handoff's continuation id, not the profile the preview evaluated.
    // They differ when the incoming identity is not the one the API answers with, and the
    // browser continues the handoff's, so the cookie has to agree with it.
    const setCookie = identitySetCookie({
      canPersistProfile: request.canPersistProfile,
      profileId: handoff.profileId,
      hadCookie: identity !== undefined,
    });
    if (setCookie) res.setHeader('Set-Cookie', setCookie);

    // A handoff is browser-visible, so it is escaped and never cached. Here it is returned as
    // JSON for brevity; render it into your page the way your framework escapes data.
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ identity: handoff.profileId ?? null, handoff }));
  })().catch((error: unknown) => {
    res.statusCode = 500;
    res.end(error instanceof Error ? error.message : 'error');
  });
});

const port = Number(process.env.PORT ?? 4100);
server.listen(port, () => {
  console.warn(`Node identity-cookie example listening on http://localhost:${port}`);
});
