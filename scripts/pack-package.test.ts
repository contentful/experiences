import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import { packPackage } from './pack-package.ts';

async function fixture(t: TestContext, name = '@example/sdk') {
  const root = await mkdtemp(path.join(os.tmpdir(), 'experiences-pack-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const packageDirectory = path.join(root, 'package');
  const outputDirectory = path.join(root, 'pkgs');
  await mkdir(path.join(packageDirectory, 'dist'), { recursive: true });
  const manifest = {
    name,
    version: '1.2.3',
    type: 'module',
    main: './dist/index.js',
    types: './dist/index.d.ts',
    exports: { '.': { types: './dist/index.d.ts', import: './dist/index.js' } },
    files: ['dist'],
    license: 'MIT',
    dependencies: { '@example/core': '1.0.0' },
  };
  await writeFile(path.join(packageDirectory, 'package.json'), JSON.stringify(manifest));
  await writeFile(path.join(packageDirectory, 'dist/index.js'), 'export const value = 1;\n');
  await writeFile(
    path.join(packageDirectory, 'dist/index.d.ts'),
    'export declare const value = 1;\n'
  );
  return { packageDirectory, outputDirectory, manifest };
}

test('refreshes both archive names at the same version', async (t) => {
  const { packageDirectory, outputDirectory } = await fixture(t);
  const packed = await packPackage(packageDirectory, outputDirectory);
  assert.equal(packed.filename, 'example-sdk-1.2.3.tgz');
  assert.equal(packed.localFilename, 'example-sdk-local.tgz');
  const archivePath = path.join(outputDirectory, packed.filename);
  const aliasPath = path.join(outputDirectory, packed.localFilename);
  assert.deepEqual(await readFile(archivePath), await readFile(aliasPath));

  const previous = await readFile(aliasPath);
  await writeFile(path.join(packageDirectory, 'dist/index.js'), 'export const value = 2;\n');
  await packPackage(packageDirectory, outputDirectory);
  assert.notDeepEqual(await readFile(aliasPath), previous);
  assert.deepEqual(await readFile(archivePath), await readFile(aliasPath));
});

test('leaves successful archives intact when an exported file is missing', async (t) => {
  const { packageDirectory, outputDirectory } = await fixture(t);
  const { filename, localFilename } = await packPackage(packageDirectory, outputDirectory);
  const previous = await readFile(path.join(outputDirectory, localFilename));
  await rm(path.join(packageDirectory, 'dist/index.d.ts'));
  await assert.rejects(
    packPackage(packageDirectory, outputDirectory),
    /packed entry point is missing/
  );
  assert.deepEqual(await readFile(path.join(outputDirectory, localFilename)), previous);
  assert.deepEqual(await readFile(path.join(outputDirectory, filename)), previous);
  assert.deepEqual((await readdir(outputDirectory)).sort(), [filename, localFilename].sort());
});

test('packing separate packages concurrently preserves each package and unrelated artifacts', async (t) => {
  const first = await fixture(t, '@example/first');
  const second = await fixture(t, '@example/second');
  await mkdir(first.outputDirectory);
  await writeFile(path.join(first.outputDirectory, 'unrelated.tgz'), 'keep');
  const results = await Promise.all([
    packPackage(first.packageDirectory, first.outputDirectory),
    packPackage(second.packageDirectory, first.outputDirectory),
  ]);
  assert.deepEqual(
    (await readdir(first.outputDirectory)).sort(),
    [
      ...results.flatMap(({ filename, localFilename }) => [filename, localFilename]),
      'unrelated.tgz',
    ].sort()
  );
  assert.equal(await readFile(path.join(first.outputDirectory, 'unrelated.tgz'), 'utf8'), 'keep');
});

test('rejects private packages', async (t) => {
  const { packageDirectory, outputDirectory, manifest } = await fixture(t);
  await writeFile(
    path.join(packageDirectory, 'package.json'),
    JSON.stringify({ ...manifest, private: true })
  );
  await assert.rejects(packPackage(packageDirectory, outputDirectory), /publishable packages/);
});
