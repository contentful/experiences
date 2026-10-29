import { execFileSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { releaseChangelog, releasePublish, releaseVersion } from 'nx/release';

export interface ReleaseOptions {
  specifier?: string;
  preid?: string;
  tag?: string;
  dryRun: boolean;
}

export interface ReleaseSteps {
  version: typeof releaseVersion;
  changelog: typeof releaseChangelog;
  publish: typeof releasePublish;
  /** Runs a workspace command and throws when it exits non-zero. */
  run: (args: string[]) => void;
}

const defaultSteps: ReleaseSteps = {
  version: releaseVersion,
  changelog: releaseChangelog,
  publish: releasePublish,
  run: (args) => execFileSync('npx', args, { stdio: 'inherit' }),
};

/**
 * Versions, rebuilds, and verifies before anything leaves the runner. Built
 * packages embed their version, so they must be rebuilt after versions are
 * written. A failed rebuild or verification leaves no commit, tag, GitHub
 * Release, or published package. Only publish can fail after the push.
 */
export async function release(
  options: ReleaseOptions,
  steps: ReleaseSteps = defaultSteps
): Promise<number> {
  const { specifier, preid, tag, dryRun } = options;

  const { workspaceVersion, projectsVersionData, releaseGraph } = await steps.version({
    specifier,
    preid,
    dryRun,
    gitCommit: false,
    gitTag: false,
  });

  if (Object.values(projectsVersionData).every((entry) => entry.newVersion === null)) {
    process.stdout.write('No projects to release.\n');
    return 0;
  }

  steps.run([
    'nx',
    'run-many',
    '-t',
    'build',
    '--exclude=tag:scope:implementation',
    '--skip-nx-cache',
  ]);
  steps.run([
    'nx',
    'run-many',
    '-t',
    'verify-release-artifact',
    '--skip-nx-cache',
    '--exclude-task-dependencies',
  ]);

  await steps.changelog({
    version: workspaceVersion,
    versionData: projectsVersionData,
    releaseGraph,
    dryRun,
  });

  const results = await steps.publish({
    tag,
    versionData: projectsVersionData,
    releaseGraph,
    dryRun,
  });
  return Object.values(results).every((result) => result.code === 0) ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({
    options: {
      specifier: { type: 'string' },
      preid: { type: 'string' },
      tag: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
    },
  });
  release({
    specifier: values.specifier,
    preid: values.preid,
    tag: values.tag,
    dryRun: values['dry-run'],
  })
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error: unknown) => {
      process.stderr.write(`${String(error)}\n`);
      process.exitCode = 1;
    });
}
