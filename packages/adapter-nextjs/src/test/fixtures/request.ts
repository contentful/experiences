import type { NextjsServerExperiencesConfig } from '../../request/server-config.js';

export function serverConfig(accessToken = 'test'): NextjsServerExperiencesConfig {
  return {
    spaceId: 'space',
    environmentId: 'master',
    delivery: { accessToken },
    config: { components: {} },
    request: { experience: { experienceId: 'home' } },
  };
}
