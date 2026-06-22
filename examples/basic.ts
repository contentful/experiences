/**
 * Basic usage example
 */

import { Client } from '../src/index';

async function main() {
  // Create a new client instance
  const client = new Client({
    apiKey: 'your-api-key',
    timeout: 10000,
  });

  // Use the client
  const result = await client.doSomething();
  console.log('Result:', result);

  // Get configuration
  const config = client.getConfig();
  console.log('Configuration:', config);
}

main().catch(console.error);
