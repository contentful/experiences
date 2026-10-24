import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

const entryUrl = (file: string): string =>
  pathToFileURL(fileURLToPath(new URL(`../dist/${file}`, import.meta.url))).href;

describe('published package entry points', () => {
  it.each(['index.js', 'primitives.js'])('%s imports under Node ESM resolution', (file) => {
    expect(() =>
      execFileSync(process.execPath, [
        '--input-type=module',
        '--eval',
        `import(${JSON.stringify(entryUrl(file))})`,
      ])
    ).not.toThrow();
  });
});
