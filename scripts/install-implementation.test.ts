import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import { fileURLToPath, URL } from 'node:url';
import { installImplementation } from './install-implementation.ts';

async function fixture(t: TestContext) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'experiences-install-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const directory = path.join(root, 'implementations', 'app');
  await mkdir(directory, { recursive: true });
  const manifest = { name: 'implementation-test', private: true, version: '0.0.0' };
  await writeFile(path.join(directory, 'package.json'), JSON.stringify(manifest));
  await writeFile(
    path.join(directory, 'project.json'),
    JSON.stringify({ tags: ['scope:implementation'] })
  );
  await writeFile(path.join(directory, '.env.example'), 'SYNTHETIC_VALUE=example\n');
  return { root, directory, manifest };
}

async function writeManifest(directory: string, manifest: Record<string, unknown>) {
  await writeFile(path.join(directory, 'package.json'), JSON.stringify(manifest));
}

async function packDependency(root: string, value: string) {
  const directory = path.join(root, 'dependency');
  await mkdir(directory, { recursive: true });
  await writeManifest(directory, {
    name: 'local-dependency',
    version: '1.0.0',
    main: 'index.js',
    scripts: { install: 'exit 1' },
  });
  await writeFile(path.join(directory, 'index.js'), `module.exports = ${JSON.stringify(value)};\n`);
  execFileSync(
    'npm',
    ['pack', '--ignore-scripts', '--workspaces=false', '--pack-destination', root],
    {
      cwd: directory,
      stdio: 'pipe',
    }
  );
}

test('preflights direct and nested override archives before clearing an installation', async (t) => {
  for (const dependency of [
    { dependencies: { missing: 'file:../../missing.tgz' } },
    { devDependencies: { missing: 'file:../../missing.tgz' } },
    { optionalDependencies: { missing: 'file:../../missing.tgz' } },
    { peerDependencies: { missing: 'file:../../missing.tgz' } },
    { overrides: { parent: { child: { '.': 'file:../../missing.tgz' } } } },
  ]) {
    const { directory, manifest } = await fixture(t);
    await writeManifest(directory, { ...manifest, ...dependency });
    const marker = path.join(directory, 'node_modules', 'keep');
    await mkdir(path.dirname(marker));
    await writeFile(marker, 'existing installation');
    await assert.rejects(installImplementation(directory), /Local package archive is unavailable/);
    assert.equal(await readFile(marker, 'utf8'), 'existing installation');
    await assert.rejects(readFile(path.join(directory, '.env')), { code: 'ENOENT' });
  }
});

test('rejects non-private packages and workspace roots before cleanup', async (t) => {
  for (const changes of [{ private: false }, { workspaces: ['implementations/*'] }]) {
    const { directory, manifest } = await fixture(t);
    await writeManifest(directory, { ...manifest, ...changes });
    await assert.rejects(installImplementation(directory), /Only private implementation packages/);
  }
});

test('requires an implementation project before cleanup', async (t) => {
  const { directory } = await fixture(t);
  await writeFile(
    path.join(directory, 'project.json'),
    JSON.stringify({ tags: ['scope:internal'] })
  );
  const marker = path.join(directory, 'node_modules', 'keep');
  await mkdir(path.dirname(marker));
  await writeFile(marker, 'existing installation');
  await assert.rejects(installImplementation(directory), /scope:implementation tag/);
  assert.equal(await readFile(marker, 'utf8'), 'existing installation');
});

test('clean install refreshes same-version tarballs and preserves local and sibling state', async (t) => {
  const { root, directory, manifest } = await fixture(t);
  await packDependency(root, 'first');
  await writeManifest(directory, {
    ...manifest,
    dependencies: { 'local-dependency': 'file:../../local-dependency-1.0.0.tgz' },
    scripts: { preinstall: 'exit 1', postinstall: 'exit 1' },
  });
  const preserved = [
    path.join(root, 'node_modules', 'keep'),
    path.join(root, 'implementations', 'sibling', 'node_modules', 'keep'),
    path.join(directory, '.credentials', 'keep'),
  ];
  for (const filename of preserved) {
    await mkdir(path.dirname(filename), { recursive: true });
    await writeFile(filename, 'preserved');
  }
  await writeManifest(root, {
    name: 'test-root',
    private: true,
    workspaces: ['implementations/*'],
  });

  await installImplementation(directory);
  const installed = path.join(directory, 'node_modules', 'local-dependency', 'index.js');
  assert.match(await readFile(installed, 'utf8'), /first/);
  assert.equal(await readFile(path.join(directory, '.env'), 'utf8'), 'SYNTHETIC_VALUE=example\n');
  await assert.rejects(readFile(path.join(directory, 'package-lock.json')), { code: 'ENOENT' });

  await writeFile(path.join(directory, '.env'), 'SYNTHETIC_VALUE=custom\n');
  await writeFile(path.join(directory, 'node_modules', 'stale-marker'), 'stale');
  await packDependency(root, 'second');
  await installImplementation(directory);
  assert.match(await readFile(installed, 'utf8'), /second/);
  await assert.rejects(readFile(path.join(directory, 'node_modules', 'stale-marker')), {
    code: 'ENOENT',
  });
  assert.equal(await readFile(path.join(directory, '.env'), 'utf8'), 'SYNTHETIC_VALUE=custom\n');
  for (const filename of preserved) assert.equal(await readFile(filename, 'utf8'), 'preserved');
});

test('CLI requires an explicit implementation directory', () => {
  assert.throws(
    () =>
      execFileSync(
        'node',
        ['--import', 'tsx', fileURLToPath(new URL('./install-implementation.ts', import.meta.url))],
        { stdio: 'pipe' }
      ),
    (error: unknown) => /Usage:/.test((error as { stderr: Buffer }).stderr.toString())
  );
});
