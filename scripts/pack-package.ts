import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

interface PackageManifest {
  private?: boolean;
  name?: string;
  version?: string;
  main?: string;
  types?: string;
  svelte?: string;
  exports?: unknown;
}

interface PackedArchive {
  name: string;
  version: string;
  filename: string;
  files: { path: string }[];
}

function exportPaths(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (value === null || typeof value !== 'object') return [];
  return Object.values(value).flatMap(exportPaths);
}

export async function packPackage(packageDirectory: string, outputDirectory: string) {
  const manifest: PackageManifest = JSON.parse(
    await readFile(path.join(packageDirectory, 'package.json'), 'utf8')
  );
  if (manifest.private || !manifest.name || !manifest.version) {
    throw new Error('Only named, versioned, publishable packages can be packed.');
  }

  await mkdir(outputDirectory, { recursive: true });
  const stagingDirectory = await mkdtemp(path.join(outputDirectory, '.pack-'));
  try {
    const result = execFileSync(
      'npm',
      [
        'pack',
        '--json',
        '--ignore-scripts',
        '--workspaces=false',
        '--pack-destination',
        stagingDirectory,
      ],
      { cwd: packageDirectory, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }
    );
    // npm 12 keys results by package name; earlier versions return an array.
    const archives: PackedArchive[] | Record<string, PackedArchive> = JSON.parse(result);
    const archive = Array.isArray(archives) ? archives[0] : archives[manifest.name];
    if (archive?.name !== manifest.name || archive?.version !== manifest.version) {
      throw new Error(`Unexpected npm pack result for ${manifest.name}.`);
    }

    const files = new Set(archive.files.map((file) => file.path));
    const entryPoints = [
      manifest.main,
      manifest.types,
      manifest.svelte,
      ...exportPaths(manifest.exports),
    ];
    for (const entry of entryPoints.filter((entry): entry is string => Boolean(entry))) {
      if (!files.has(entry.replace(/^\.\//, ''))) {
        throw new Error(`${manifest.name}: packed entry point is missing: ${entry}`);
      }
    }

    const localFilename = `${manifest.name.replace(/^@/, '').replaceAll('/', '-')}-local.tgz`;
    const archivePath = path.join(stagingDirectory, archive.filename);
    const localPath = path.join(stagingDirectory, localFilename);
    await copyFile(archivePath, localPath);
    await rename(archivePath, path.join(outputDirectory, archive.filename));
    await rename(localPath, path.join(outputDirectory, localFilename));
    return { filename: archive.filename, localFilename };
  } finally {
    await rm(stagingDirectory, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  packPackage(process.cwd(), path.join(workspaceRoot, 'pkgs'))
    .then((packed) => {
      process.stdout.write(`Packed ${packed.filename} and ${packed.localFilename}\n`);
    })
    .catch((error: unknown) => {
      process.stderr.write(`${String(error)}\n`);
      process.exitCode = 1;
    });
}
