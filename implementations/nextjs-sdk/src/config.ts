import 'server-only';

import {
  configureNextjsServerExperiences,
  createNextjsPrivateFetch,
} from '@contentful/experiences-nextjs/server';
import { parse } from 'dotenv';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

const defaultExperienceIds = [
  '3fLAdFb3BYAuImRhcW8k4t',
  '4WzbgzPQHa9Tr2ffbOU8p7',
  '7u2eP09B4BIBToH8UwSHck',
];

// Read only the application file, at request time. No sibling configuration or
// implicit NEXT_PUBLIC_* projection is part of this server reference.
function configureServer() {
  const env = parse(readFileSync(resolve(process.cwd(), '.env')));
  function required(name: string) {
    const value = env[name]?.trim();
    if (!value) throw new Error(`Set ${name} in implementations/nextjs-sdk/.env.`);
    return value;
  }
  const ids = env.EXPERIENCE_IDS?.split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  const experienceIds = ids?.length ? [...new Set(ids)] : [...defaultExperienceIds];
  const origin = new URL(env.ORIGIN?.trim() || 'http://localhost:3500');
  if (
    !['http:', 'https:'].includes(origin.protocol) ||
    origin.username ||
    origin.password ||
    origin.pathname !== '/' ||
    origin.search ||
    origin.hash
  ) {
    throw new Error('ORIGIN must be an HTTP(S) origin without credentials, path, query or hash.');
  }
  const livePreviewEnabled = env.LIVE_PREVIEW_ENABLED === 'true';
  const config = {
    origin: origin.origin,
    spaceId: required('SPACE_ID'),
    environmentId: env.ENVIRONMENT_ID?.trim() || 'master',
    delivery: { accessToken: required('CDA_TOKEN') },
    locale: env.LOCALE?.trim() || 'en-US',
    experienceIds,
    preview: livePreviewEnabled
      ? { accessToken: required('PREVIEW_TOKEN'), host: env.PREVIEW_HOST?.trim() || undefined }
      : undefined,
    livePreview: livePreviewEnabled
      ? {
          experienceId: env.LIVE_PREVIEW_EXPERIENCE_ID?.trim() || experienceIds[0],
          sessionHost: env.LIVE_PREVIEW_SESSION_HOST?.trim() || undefined,
          resourceResolution: env.LIVE_PREVIEW_RESOURCE_RESOLUTION?.trim() || undefined,
        }
      : undefined,
  };
  return {
    config,
    sdk: configureNextjsServerExperiences({
      spaceId: config.spaceId,
      environmentId: config.environmentId,
      locale: config.locale,
      delivery: { ...config.delivery, fetch: createNextjsPrivateFetch() },
      // The frozen Preview Session helper owns its fetch transport.
      preview: config.preview,
    }),
  };
}

let server: ReturnType<typeof configureServer> | undefined;
export function getServer() {
  return (server ??= configureServer());
}
