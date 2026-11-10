import type { ServerConfig } from '../../request/server-config.js';

export function serverConfig(accessToken = 'test'): ServerConfig {
  return {
    spaceId: 'space',
    environmentId: 'master',
    delivery: { accessToken },
    config: { components: {} },
    request: { experience: { experienceId: 'home' } },
  };
}
