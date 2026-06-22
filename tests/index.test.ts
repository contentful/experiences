import { describe, it, expect } from 'vitest';
import { Client } from '../src/index';

describe('Client', () => {
  it('should create a client with default config', () => {
    const client = new Client();
    const config = client.getConfig();

    expect(config.timeout).toBe(5000);
    expect(config.retries).toBe(3);
  });

  it('should create a client with custom config', () => {
    const client = new Client({
      apiKey: 'test-key',
      timeout: 10000,
    });

    const config = client.getConfig();

    expect(config.apiKey).toBe('test-key');
    expect(config.timeout).toBe(10000);
    expect(config.retries).toBe(3); // default value
  });

  it('should execute doSomething method', async () => {
    const client = new Client();
    const result = await client.doSomething();

    expect(result).toBe('Hello from your SDK!');
  });
});
