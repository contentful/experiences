// adapter-node production listener; no credentials or API requests at startup.
import { createServer } from 'node:http';
import { handler } from './build/handler.js';
createServer(handler).listen(3600, '127.0.0.1', () => {
  console.log('Svelte SDK reference: http://127.0.0.1:3600');
});
