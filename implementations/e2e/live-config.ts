import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The maintained references this suite drives, with their fixed local ports. */
export const apps = {
  'node-sdk': { port: 3100, command: 'npm run dev' },
  'web-sdk': { port: 3200, command: 'npm run dev' },
  'node-sdk+web-sdk': { port: 3300, command: 'npm run dev' },
  'react-sdk': { port: 3400, command: 'npm run dev' },
  'nextjs-sdk': { port: 3500, command: 'npm run start' },
} as const;

export type AppName = keyof typeof apps;

const implementations = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const required = ['SPACE_ID', 'CDA_TOKEN', 'DESTINATION_ID'] as const;

/** Reads only key presence from the app's ignored `.env`; values are never returned or logged. */
function presentKeys(app: AppName): Set<string> {
  const file = resolve(implementations, app, '.env');
  if (!existsSync(file)) return new Set();
  const keys = new Set<string>();
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const match = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (match?.[2]) keys.add(match[1]!);
  }
  return keys;
}

/** Why live checks for an app cannot run, or `undefined` when its configuration is present. */
export function missingLiveConfiguration(app: AppName): string | undefined {
  const keys = presentKeys(app);
  const missing = required.filter((key) => !keys.has(key) && !process.env[key]);
  return missing.length
    ? `Skipping live ${app} checks: set ${missing.join(', ')} in implementations/${app}/.env ` +
        '(see implementations/e2e/README.md).'
    : undefined;
}

export const appDirectory = (app: AppName) => resolve(implementations, app);
export const baseUrl = (app: AppName) => `http://127.0.0.1:${apps[app].port}`;

/** The seeded "Experiences SDK Reference Site" fixture (lib/mocks/scripts/seedDestination.ts). */
export const fixture = {
  homePath: '/',
  contentPath: '/getting-started',
  personalizedPath: '/spring-offers',
  nodeId: 'spring-offers',
  redirectPath: '/quick-start',
  redirectTarget: '/getting-started',
  missingPath: '/retired-page',
  coded: 'Coded Experience Content',
  personalized: 'Personalized Composed Experience Content',
  composed: 'Composed Experience Content',
};
