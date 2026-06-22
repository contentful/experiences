/**
 * Advanced usage example with custom configuration
 */

import { Client, Config } from '../src/index';

async function main() {
  // Advanced configuration
  const config: Config = {
    apiKey: process.env.API_KEY,
    timeout: 30000,
    retries: 5,
  };

  const client = new Client(config);

  try {
    // Execute operations
    const result = await client.doSomething();
    console.log('Success:', result);
  } catch (error) {
    console.error('Error:', error);
  }
}

main().catch(console.error);
