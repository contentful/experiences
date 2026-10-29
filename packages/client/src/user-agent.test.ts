import { afterEach, describe, it, expect, vi } from 'vitest';
import {
  createUserAgentHeaders,
  EXPERIENCES_CLIENT_SDK,
  getUserAgentHeader,
  USER_AGENT_HEADER,
} from './user-agent.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getUserAgentHeader', () => {
  it('reports node.js platform and OS', () => {
    expect(getUserAgentHeader('experiences-node/0.6.0')).toMatch(
      /^sdk experiences-node\/0\.6\.0; platform node\.js\/v[\d.]+; os (macOS|Linux|Windows|Android)\/v[\d.]+;$/
    );
  });

  it('includes app, integration, and feature in order', () => {
    expect(getUserAgentHeader('sdk/1.0.0', 'app/1.0.0', 'integration/2.0.0', 'feature')).toMatch(
      /^app app\/1\.0\.0; integration integration\/2\.0\.0; feature feature; sdk sdk\/1\.0\.0; /
    );
  });

  it('reports a browser when process is a polyfill', () => {
    vi.stubGlobal('process', { browser: true });
    vi.stubGlobal('window', { navigator: { userAgent: 'Mozilla/5.0', platform: 'MacIntel' } });
    const value = getUserAgentHeader('experiences-web/0.4.0');
    vi.unstubAllGlobals();
    expect(value).toBe('sdk experiences-web/0.4.0; platform browser; os macOS;');
  });

  it('reports React Native', () => {
    vi.stubGlobal('window', {
      navigator: { product: 'ReactNative', userAgent: '', platform: 'iPhone' },
    });
    const value = getUserAgentHeader('experiences-client/0.10.7');
    vi.unstubAllGlobals();
    expect(value).toBe('sdk experiences-client/0.10.7; platform ReactNative; os iOS;');
  });

  it('omits the OS when the browser platform is unknown', () => {
    vi.stubGlobal('process', { browser: true });
    vi.stubGlobal('window', { navigator: { userAgent: '', platform: '' } });
    const value = getUserAgentHeader('experiences-web/0.4.0');
    vi.unstubAllGlobals();
    expect(value).toBe('sdk experiences-web/0.4.0; platform browser;');
  });
});

describe('createUserAgentHeaders', () => {
  it('reports the SDK without its npm scope', () => {
    const value = createUserAgentHeaders({
      name: '@contentful/experiences-web',
      version: '0.4.0',
    })[USER_AGENT_HEADER];

    expect(value).toMatch(/^sdk experiences-web\/0\.4\.0; platform node\.js\//);
  });

  it('prefixes the application when provided', () => {
    const value = createUserAgentHeaders(EXPERIENCES_CLIENT_SDK, {
      name: 'my-site',
      version: '1.2.3',
    })[USER_AGENT_HEADER];

    expect(value).toMatch(/^app my-site\/1\.2\.3; sdk experiences-client\/0\.0\.0; /);
  });
});
