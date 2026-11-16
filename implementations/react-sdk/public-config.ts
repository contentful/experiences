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
  return {
    SPACE_ID: env.SPACE_ID?.trim() || '',
    ENVIRONMENT_ID: env.ENVIRONMENT_ID?.trim() || 'master',
    CDA_TOKEN: env.CDA_TOKEN?.trim() || '',
    LOCALE: env.LOCALE?.trim() || 'en-US',
    EXPERIENCE_IDS: ids?.length ? [...new Set(ids)] : [...defaultExperienceIds],
  };
}

export type PublicEnvironment = ReturnType<typeof getPublicEnvironment>;
