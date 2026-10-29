import assert from 'node:assert/strict';
import { test } from 'node:test';
import { release, type ReleaseSteps } from './release.ts';

type VersionResult = Awaited<ReturnType<ReleaseSteps['version']>>;

function fakeSteps(
  newVersion: string | null,
  overrides: Partial<Pick<ReleaseSteps, 'run'>> & { publishCode?: number } = {}
) {
  const calls: string[] = [];
  const versionResult = {
    workspaceVersion: undefined,
    projectsVersionData: { client: { currentVersion: '0.10.7', newVersion } },
    releaseGraph: {},
  } as unknown as VersionResult;
  const steps: ReleaseSteps = {
    version: async (args) => {
      calls.push(`version gitCommit=${args.gitCommit} gitTag=${args.gitTag}`);
      return versionResult;
    },
    changelog: async (args) => {
      assert.equal(args.versionData, versionResult.projectsVersionData);
      calls.push('changelog');
      return {};
    },
    publish: async (args) => {
      assert.equal(args.versionData, versionResult.projectsVersionData);
      calls.push(`publish tag=${args.tag}`);
      return { client: { code: overrides.publishCode ?? 0 } };
    },
    run: overrides.run ?? ((args) => calls.push(args.slice(0, 4).join(' '))),
  };
  return { steps, calls };
}

test('rebuilds and verifies after versioning, before committing or publishing', async () => {
  const { steps, calls } = fakeSteps('0.10.8');
  const code = await release({ dryRun: false, tag: 'dev' }, steps);
  assert.equal(code, 0);
  assert.deepEqual(calls, [
    'version gitCommit=false gitTag=false',
    'nx run-many -t build',
    'nx run-many -t verify-release-artifact',
    'changelog',
    'publish tag=dev',
  ]);
});

test('stops before changelog and publish when verification fails', async () => {
  const { steps, calls } = fakeSteps('0.10.8', {
    run: (args) => {
      if (args.includes('verify-release-artifact')) throw new Error('version mismatch');
    },
  });
  await assert.rejects(release({ dryRun: false }, steps), /version mismatch/);
  assert.deepEqual(calls, ['version gitCommit=false gitTag=false']);
});

test('skips everything after versioning when nothing changed', async () => {
  const { steps, calls } = fakeSteps(null);
  assert.equal(await release({ dryRun: false }, steps), 0);
  assert.deepEqual(calls, ['version gitCommit=false gitTag=false']);
});

test('fails when any package fails to publish', async () => {
  const { steps } = fakeSteps('0.10.8', { publishCode: 1 });
  assert.equal(await release({ dryRun: false }, steps), 1);
});
