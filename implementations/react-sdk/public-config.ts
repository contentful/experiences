// Reference app: the same reference data as Web, with optional local overrides.
const defaultExperienceIds = [
  '3fLAdFb3BYAuImRhcW8k4t',
  '4WzbgzPQHa9Tr2ffbOU8p7',
  '7u2eP09B4BIBToH8UwSHck',
];

// Optional Destination routes; absolute paths, defaults match the shared fixture.
function destinationPath(value: string | undefined, fallback: string) {
  const path = value?.trim() || fallback;
  if (!path.startsWith('/') || path.startsWith('//'))
    throw new Error('Destination paths must be absolute and start with a single /.');
  return path;
}

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
    // A Destination id is not a credential; unset keeps destination routes unconfigured.
    DESTINATION: env.DESTINATION_ID?.trim()
      ? {
          id: env.DESTINATION_ID.trim(),
          path: destinationPath(env.DESTINATION_PATH, '/coded'),
          nodeId: env.DESTINATION_NODE_ID?.trim() || 'sdk-ci-personalized',
          redirectPath: destinationPath(env.DESTINATION_REDIRECT_PATH, '/legacy'),
          missingPath: destinationPath(env.DESTINATION_MISSING_PATH, '/missing'),
        }
      : undefined,
    ...(previewEnabled
      ? {
          LIVE_PREVIEW: {
            accessToken: env.BROWSER_PREVIEW_TOKEN!.trim(),
            host: env.BROWSER_PREVIEW_HOST?.trim() || undefined,
            experienceId:
              env.LIVE_PREVIEW_EXPERIENCE_ID?.trim() || ids?.[0] || defaultExperienceIds[0],
            sessionHost: env.LIVE_PREVIEW_SESSION_HOST?.trim() || undefined,
            resourceResolution: env.LIVE_PREVIEW_RESOURCE_RESOLUTION?.trim() || undefined,
          },
        }
      : {}),
  };
}

export type PublicEnvironment = ReturnType<typeof getPublicEnvironment>;
