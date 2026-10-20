import { execFileSync } from 'node:child_process';
import { constants } from 'node:fs';
import { copyFile, readFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

function localArchives(value: unknown): string[] {
  if (typeof value === 'string') return value.startsWith('file:') ? [value.slice(5)] : [];
  if (value === null || typeof value !== 'object') return [];
  return Object.values(value).flatMap(localArchives);
}

export async function installImplementation(implementationDirectory: string) {
  if (!implementationDirectory) throw new Error('An implementation directory is required.');
  const directory = path.resolve(implementationDirectory);
  const manifest: Record<string, unknown> = JSON.parse(
    await readFile(path.join(directory, 'package.json'), 'utf8')
  );
  if (manifest.private !== true || manifest.workspaces) {
    throw new Error('Only private implementation packages without workspaces can be installed.');
  }
  const project: Record<string, unknown> = JSON.parse(
    await readFile(path.join(directory, 'project.json'), 'utf8')
  );
  if (!Array.isArray(project.tags) || !project.tags.includes('scope:implementation')) {
    throw new Error('The project must have the scope:implementation tag.');
  }

  const archives = localArchives([
    manifest.dependencies,
    manifest.devDependencies,
    manifest.optionalDependencies,
    manifest.peerDependencies,
    manifest.overrides,
  ]);
  for (const archive of new Set(archives)) {
    const archivePath = path.resolve(directory, archive);
    const archiveStat = await stat(archivePath).catch((error) => {
      throw new Error(`Local package archive is unavailable: ${archivePath}`, { cause: error });
    });
    if (!archiveStat.isFile()) {
      throw new Error(`Local package archive is not a file: ${archivePath}`);
    }
  }

  // The hidden npm lock retains integrity for old bytes under a stable tarball name.
  await rm(path.join(directory, 'node_modules'), { recursive: true, force: true });
  execFileSync(
    'npm',
    [
      'install',
      '--workspaces=false',
      '--package-lock=false',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
    ],
    { cwd: directory, stdio: 'inherit' }
  );

  try {
    await copyFile(
      path.join(directory, '.env.example'),
      path.join(directory, '.env'),
      constants.COPYFILE_EXCL
    );
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code !== 'EEXIST' && code !== 'ENOENT') throw error;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const directory = process.argv[2];
  if (process.argv.length !== 3 || !directory)
    throw new Error('Usage: tsx scripts/install-implementation.ts <directory>');
  installImplementation(directory).catch((error: unknown) => {
    process.stderr.write(`${String(error)}\n`);
    process.exitCode = 1;
  });
}
