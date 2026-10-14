import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

const packageEntry = pathToFileURL(
  fileURLToPath(new URL('../dist/index.js', import.meta.url))
).href;

describe('published package entry point', () => {
  it('imports under Node ESM resolution', () => {
    expect(() =>
      execFileSync(process.execPath, [
        '--input-type=module',
        '--eval',
        `import(${JSON.stringify(packageEntry)})`,
      ])
    ).not.toThrow();
  });
});
