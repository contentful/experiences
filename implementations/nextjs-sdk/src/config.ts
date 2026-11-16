// Node-only configuration. Pages GSSP strips this import from its browser bundle;
// App consumers use the server-only request loader. Never import from client UI.

import {
  configureNextjsServerExperiences,
  createNextjsPrivateFetch,
} from '@contentful/experiences-nextjs/server';
import { parse } from 'dotenv';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import type { BrowserEnvironment } from './reference';

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
          ...(env.LIVE_PREVIEW_SESSION_HOST?.trim()
            ? { sessionHost: env.LIVE_PREVIEW_SESSION_HOST.trim() }
            : {}),
          ...(env.LIVE_PREVIEW_RESOURCE_RESOLUTION?.trim()
            ? { resourceResolution: env.LIVE_PREVIEW_RESOURCE_RESOLUTION.trim() }
            : {}),
        }
      : undefined,
  };
  const nodeConfig = {
    spaceId: config.spaceId,
    environmentId: config.environmentId,
    locale: config.locale,
    delivery: { ...config.delivery, fetch: createNextjsPrivateFetch() },
    // The frozen Preview Session helper owns its fetch transport.
    preview: config.preview,
  };
  const browser: BrowserEnvironment = {
    web: {
      spaceId: config.spaceId,
      environmentId: config.environmentId,
      locale: config.locale,
      // Only explicitly browser-designated credentials may cross this boundary.
      // Without one, the real same-app proxy owns private upstream authentication.
      delivery: env.BROWSER_CDA_TOKEN?.trim()
        ? { accessToken: env.BROWSER_CDA_TOKEN.trim() }
        : { host: `${config.origin}/api/delivery` },
      ...(livePreviewEnabled && env.BROWSER_PREVIEW_TOKEN?.trim()
        ? {
            preview: {
              accessToken: env.BROWSER_PREVIEW_TOKEN.trim(),
              ...(env.BROWSER_PREVIEW_HOST?.trim()
                ? { host: env.BROWSER_PREVIEW_HOST.trim() }
                : {}),
            },
          }
        : {}),
    },
    experienceIds,
    ...(config.livePreview ? { livePreview: config.livePreview } : {}),
  };
  return { config, nodeConfig, browser, sdk: configureNextjsServerExperiences(nodeConfig) };
}

let server: ReturnType<typeof configureServer> | undefined;
export function getServer() {
  return (server ??= configureServer());
}
