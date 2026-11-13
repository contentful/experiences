import { createRoutes } from '../dist/shared.js';
import { parse } from 'dotenv';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Reference app: read only this application's file, independent of the caller's
// environment and sibling implementations. Setup preserves an existing .env.
const env = parse(readFileSync(resolve(import.meta.dirname, '../.env')));

function required(name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Set ${name} in implementations/node-sdk+web-sdk/.env.`);
  return value;
}

const port = Number(env.PORT?.trim() || 3300);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT in implementations/node-sdk+web-sdk/.env must be between 1 and 65535.');
}

const defaultExperienceIds = [
  '3fLAdFb3BYAuImRhcW8k4t',
  '4WzbgzPQHa9Tr2ffbOU8p7',
  '7u2eP09B4BIBToH8UwSHck',
];
const experienceIds = (env.EXPERIENCE_IDS?.trim() || defaultExperienceIds.join(','))
  .split(',')
  .map((id) => id.trim())
  .filter(Boolean);
if (!experienceIds.length) throw new Error('EXPERIENCE_IDS must contain an Experience ID.');
const previewEnabled = env.LIVE_PREVIEW_ENABLED === 'true';

export const config = {
  port,
  livePreviewEnabled: previewEnabled,
  preview: previewEnabled
    ? {
        accessToken: required('PREVIEW_TOKEN'),
        host: env.PREVIEW_HOST?.trim() || undefined,
      }
    : undefined,
  // Consumer integration: this is the complete allowlist for browser
  // bootstrap. CDA_TOKEN must be suitable for public browser use. Never spread env.
  publicEnvironment: {
    SPACE_ID: required('SPACE_ID'),
    ENVIRONMENT_ID: env.ENVIRONMENT_ID?.trim() || 'master',
    CDA_TOKEN: required('CDA_TOKEN'),
    LOCALE: env.LOCALE?.trim() || 'en-US',
    EXPERIENCE_IDS: [...new Set(experienceIds)],
    // Optional Destination demonstration. Ids and paths are not secrets, but they
    // still pass through this allowlist; a blank DESTINATION_ID disables the route content.
    DESTINATION_ID: env.DESTINATION_ID?.trim() || undefined,
    DESTINATION_PATH: env.DESTINATION_PATH?.trim() || '/getting-started',
    DESTINATION_NODE_ID: env.DESTINATION_NODE_ID?.trim() || 'spring-offers',
    DESTINATION_REDIRECT_PATH: env.DESTINATION_REDIRECT_PATH?.trim() || '/quick-start',
    DESTINATION_MISSING_PATH: env.DESTINATION_MISSING_PATH?.trim() || '/retired-page',
    ...(previewEnabled
      ? {
          LIVE_PREVIEW: {
            accessToken: required('BROWSER_PREVIEW_TOKEN'),
            host: env.BROWSER_PREVIEW_HOST?.trim() || undefined,
            experienceId: env.LIVE_PREVIEW_EXPERIENCE_ID?.trim() || experienceIds[0],
            sessionHost: env.LIVE_PREVIEW_SESSION_HOST?.trim() || undefined,
            resourceResolution: env.LIVE_PREVIEW_RESOURCE_RESOLUTION?.trim() || undefined,
          },
        }
      : {}),
  },
};

// Reference app: route presentations reuse plans; fetch each distinct ID once.
export const routes = createRoutes(config.publicEnvironment.EXPERIENCE_IDS);
