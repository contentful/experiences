import '$app/server';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'dotenv';
import { getPublicEnvironment } from '../../../public-config.js';
// Private configuration is read lazily from this app only, never during a build.
export function getServerConfiguration() {
  const path = resolve(process.cwd(), '.env');
  const env = existsSync(path) ? parse(readFileSync(path)) : {};
  const browser = getPublicEnvironment(env);
  const required = (name: string) => {
    const value = env[name]?.trim();
    if (!value) throw new Error(`Set ${name} in implementations/svelte-sdk/.env.`);
    return value;
  };
  const origin = new URL(browser.origin);
  if (
    !['http:', 'https:'].includes(origin.protocol) ||
    origin.username ||
    origin.password ||
    origin.pathname !== '/' ||
    origin.search ||
    origin.hash
  )
    throw new Error('ORIGIN must be an HTTP(S) origin without credentials, path, query or hash.');
  if (browser.configurationError) throw new Error(browser.configurationError);
  const node = {
    spaceId: required('SPACE_ID'),
    environmentId: browser.environmentId,
    locale: browser.locale,
    delivery: { accessToken: required('CDA_TOKEN'), fetch: privateFetch },
    ...(browser.previewEnabled
      ? {
          preview: {
            accessToken: required('PREVIEW_TOKEN'),
            host: env.PREVIEW_HOST?.trim() || undefined,
            sessionHost: browser.preview?.sessionHost,
            resourceResolution: browser.preview?.resourceResolution,
          },
        }
      : {}),
  };
  return { node, browser, origin: origin.origin };
}
const privateFetch: typeof globalThis.fetch = (input, init) =>
  globalThis.fetch(input, { ...init, cache: 'no-store', redirect: 'error' });
