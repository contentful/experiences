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

export const config = {
  port,
  // Consumer integration: this is the complete allowlist for browser
  // bootstrap. CDA_TOKEN must be suitable for public browser use. Never spread env.
  publicEnvironment: {
    SPACE_ID: required('SPACE_ID'),
    ENVIRONMENT_ID: env.ENVIRONMENT_ID?.trim() || 'master',
    CDA_TOKEN: required('CDA_TOKEN'),
    LOCALE: env.LOCALE?.trim() || 'en-US',
    EXPERIENCE_IDS: [...new Set(experienceIds)],
  },
};

// Reference app: route presentations reuse plans; fetch each distinct ID once.
export const routes = createRoutes(config.publicEnvironment.EXPERIENCE_IDS);
