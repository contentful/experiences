import { EXPERIENCES_NODE_SDK_VERSION } from '@contentful/experiences-node';
import express from 'express';
import process from 'node:process';

const app = express();
app.get('/health', (_request, response) => response.type('text/plain').send('ok'));

const port = Number(process.env.PORT ?? 3100);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535.');
}

const server = app.listen(port, '127.0.0.1', () => {
  process.stdout.write(
    `Experiences Node SDK ${EXPERIENCES_NODE_SDK_VERSION}: http://localhost:${port}/health\n`
  );
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => server.close());
}
