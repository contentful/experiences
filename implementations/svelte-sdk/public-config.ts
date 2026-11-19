// This is the complete browser allowlist. Private tokens and session IDs never enter it.
export const defaultExperienceIds = [
  '3fLAdFb3BYAuImRhcW8k4t',
  '4WzbgzPQHa9Tr2ffbOU8p7',
  '7u2eP09B4BIBToH8UwSHck',
];
export function getPublicEnvironment(env: Record<string, string>) {
  const ids = env.EXPERIENCE_IDS?.split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  const previewEnabled = env.LIVE_PREVIEW_ENABLED === 'true';
  const previewToken = env.BROWSER_PREVIEW_TOKEN?.trim();
  return {
    spaceId: env.SPACE_ID?.trim() || '',
    environmentId: env.ENVIRONMENT_ID?.trim() || 'master',
    locale: env.LOCALE?.trim() || 'en-US',
    origin: env.ORIGIN?.trim() || 'http://127.0.0.1:3600',
    experienceIds: ids?.length ? [...new Set(ids)] : [...defaultExperienceIds],
    delivery: env.BROWSER_CDA_TOKEN?.trim()
      ? { accessToken: env.BROWSER_CDA_TOKEN.trim() }
      : { host: `${env.ORIGIN?.trim() || 'http://127.0.0.1:3600'}/api/delivery` },
    previewEnabled,
    ...(previewEnabled && previewToken
      ? {
          preview: {
            accessToken: previewToken,
            host: env.BROWSER_PREVIEW_HOST?.trim() || undefined,
            sessionHost: env.LIVE_PREVIEW_SESSION_HOST?.trim() || undefined,
            resourceResolution: env.LIVE_PREVIEW_RESOURCE_RESOLUTION?.trim() || undefined,
          },
        }
      : {}),
    configurationError: !env.SPACE_ID?.trim()
      ? 'Set SPACE_ID and server CDA_TOKEN in implementations/svelte-sdk/.env, then rebuild.'
      : previewEnabled && !previewToken
        ? 'Preview requires a separate browser-approved BROWSER_PREVIEW_TOKEN. Rebuild after configuration.'
        : undefined,
  };
}
export type PublicEnvironment = ReturnType<typeof getPublicEnvironment>;
