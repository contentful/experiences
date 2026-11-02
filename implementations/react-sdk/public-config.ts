// Reference app: the same reference data as Web, with optional local overrides.
const defaultExperienceIds = [
  '3fLAdFb3BYAuImRhcW8k4t',
  '4WzbgzPQHa9Tr2ffbOU8p7',
  '7u2eP09B4BIBToH8UwSHck',
];

// Consumer integration: this is the entire browser allowlist. Never spread an
// environment object or include management/server-only preview credentials.
export function getPublicEnvironment(env: Record<string, string>) {
  const ids = env.EXPERIENCE_IDS?.split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  const previewEnabled = env.LIVE_PREVIEW_ENABLED === 'true';
  if (previewEnabled && !env.BROWSER_PREVIEW_TOKEN?.trim())
    throw new Error(
      'Set BROWSER_PREVIEW_TOKEN to a preview credential approved for browser exposure.'
    );
  return {
    SPACE_ID: env.SPACE_ID?.trim() || '',
    ENVIRONMENT_ID: env.ENVIRONMENT_ID?.trim() || 'master',
    CDA_TOKEN: env.CDA_TOKEN?.trim() || '',
    LOCALE: env.LOCALE?.trim() || 'en-US',
    EXPERIENCE_IDS: ids?.length ? [...new Set(ids)] : [...defaultExperienceIds],
    ...(previewEnabled
      ? {
          LIVE_PREVIEW: {
            accessToken: env.BROWSER_PREVIEW_TOKEN!.trim(),
            host: env.BROWSER_PREVIEW_HOST?.trim() || undefined,
            experienceId:
              env.LIVE_PREVIEW_EXPERIENCE_ID?.trim() || ids?.[0] || defaultExperienceIds[0],
            sessionId: env.LIVE_PREVIEW_SESSION_ID?.trim() || undefined,
            sessionHost: env.LIVE_PREVIEW_SESSION_HOST?.trim() || undefined,
            resourceResolution: env.LIVE_PREVIEW_RESOURCE_RESOLUTION?.trim() || undefined,
          },
        }
      : {}),
  };
}

export type PublicEnvironment = ReturnType<typeof getPublicEnvironment>;
