import { describe, it, expect } from 'vitest';
import { createUserAgentHeaders, EXPERIENCES_CLIENT_SDK, USER_AGENT_HEADER } from './user-agent.js';

describe('createUserAgentHeaders', () => {
  it('reports the SDK without its npm scope, plus platform and OS', () => {
    const value = createUserAgentHeaders({
      name: '@contentful/experiences-web',
      version: '0.4.0',
    })[USER_AGENT_HEADER];

    expect(value).toMatch(/^sdk experiences-web\/0\.4\.0; platform node\.js\/v?[\d.]+; os \S+;$/);
  });

  it('prefixes the application when provided', () => {
    const value = createUserAgentHeaders(EXPERIENCES_CLIENT_SDK, {
      name: 'my-site',
      version: '1.2.3',
    })[USER_AGENT_HEADER];

    expect(value).toMatch(/^app my-site\/1\.2\.3; sdk experiences-client\/0\.0\.0; /);
  });
});
