import { copyFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const DTS_SUFFIX = '.d.ts';

/**
 * Copies generated root-level declarations to explicit ESM and CommonJS variants.
 * Preserves the bundler's CommonJS declarations and their format-specific chunk references.
 */
export function emitDualDts(distDir: string): void {
  const declarationFiles = readdirSync(distDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(DTS_SUFFIX))
    .map((entry) => entry.name);

  for (const declarationFile of declarationFiles) {
    const baseName = declarationFile.slice(0, -DTS_SUFFIX.length);
    const sourceFile = resolve(distDir, declarationFile);
    const esmTypesFile = resolve(distDir, `${baseName}.d.mts`);
    const cjsTypesFile = resolve(distDir, `${baseName}.d.cts`);

    copyFileSync(sourceFile, esmTypesFile);
    if (!existsSync(cjsTypesFile)) copyFileSync(sourceFile, cjsTypesFile);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  emitDualDts(process.argv[2] ?? 'dist');
}
