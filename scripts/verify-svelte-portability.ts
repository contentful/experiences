import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { packPackage } from './pack-package.js';

// A package probe, deliberately outside the workspace: no app, router or service.
const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
async function verifySveltePortability() {
  const temporary = await realpath(
    await mkdtemp(path.join(tmpdir(), 'experiences-svelte-portability-'))
  );
  const environment = { ...process.env };
  delete environment.NODE_PATH;
  const sdkPrefix = '@contentful/experiences-';
  interface Manifest {
    name: string;
    version: string;
    dependencies?: Record<string, string>;
  }
  function report(message: string) {
    process.stdout.write(`${message}\n`);
  }
  function run(command: string, args: string[]) {
    return execFileSync(command, args, {
      cwd: temporary,
      env: environment,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'inherit'],
    });
  }

  try {
    const manifests = new Map<string, { directory: string; manifest: Manifest }>();
    for (const entry of await readdir(path.join(workspace, 'packages'))) {
      const directory = path.join(workspace, 'packages', entry);
      const manifest: Manifest = JSON.parse(
        await readFile(path.join(directory, 'package.json'), 'utf8')
      );
      manifests.set(manifest.name, { directory, manifest });
    }
    const closure = new Set<string>();
    function include(name: string) {
      if (closure.has(name)) return;
      const entry = manifests.get(name);
      if (!entry) throw new Error(`Missing local SDK package: ${name}`);
      closure.add(name);
      for (const dependency of Object.keys(entry.manifest.dependencies ?? {})) {
        if (dependency.startsWith(sdkPrefix)) include(dependency);
      }
    }
    include('@contentful/experiences-svelte');
    const archives: string[] = [];
    for (const name of closure) {
      const { directory, manifest } = manifests.get(name)!;
      const packed = await packPackage(directory, temporary);
      const archive = path.join(temporary, packed.filename);
      if (name === '@contentful/experiences-svelte') {
        const members = run('tar', ['-tf', archive]).trim().split('\n');
        const developmentArtifact =
          /(?:^|\/)(?:test|tests|__tests__|fixtures|test-fixtures|test-support|node_modules)(?:\/|$)|\.(?:test|spec)\.|(?:^|\/)(?:vitest|test-setup)\./;
        const unexpected = members.filter((member) => developmentArtifact.test(member));
        if (unexpected.length) {
          throw new Error(`Development artifacts in Svelte package:\n${unexpected.join('\n')}`);
        }
        report('Svelte archive excludes tests, fixtures and development support');
      }
      archives.push(archive);
      report(
        `${name}@${manifest.version} SHA-256 ${createHash('sha256')
          .update(await readFile(archive))
          .digest('hex')}`
      );
    }
    await writeFile(
      path.join(temporary, 'package.json'),
      JSON.stringify({ private: true, type: 'module' })
    );
    report(`Node ${process.version}; npm ${run('npm', ['--version']).trim()}`);
    const lock = JSON.parse(await readFile(path.join(workspace, 'package-lock.json'), 'utf8'));
    const nodeTypesVersion = lock.packages['node_modules/@types/node'].version;
    // Explicit tarballs prevent semver from falling back to published SDK packages.
    report(
      run('npm', [
        'install',
        '--workspaces=false',
        '--package-lock=false',
        '--ignore-scripts',
        '--no-audit',
        '--no-fund',
        ...archives,
        'svelte@5.57.3',
        'typescript@5.9.3',
        `@types/node@${nodeTypesVersion}`,
      ])
    );
    const modules = path.join(temporary, 'node_modules');
    async function inspect(directory: string) {
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        const filename = path.join(directory, entry.name);
        if (entry.isSymbolicLink()) {
          const target = await realpath(filename);
          if (!target.startsWith(`${temporary}/`))
            throw new Error(`External link: ${filename} -> ${target}`);
        }
        if (entry.isDirectory()) {
          if (filename.endsWith('/@sveltejs/kit'))
            throw new Error(`Kit was installed: ${filename}`);
          if (
            /(?:^|\/)node_modules\/(?:vitest|@vitest|@testing-library|jsdom|svelte-check)(?:\/|$)/.test(
              filename
            )
          )
            throw new Error(`Development dependency installed by SDK package: ${filename}`);
          if (entry.name.startsWith('experiences-') && path.basename(directory) === '@contentful') {
            const relative = path.relative(modules, filename);
            if (
              !relative.startsWith('@contentful/experiences-') ||
              relative.split(path.sep).length !== 2
            ) {
              throw new Error(`Nested SDK registry fallback: ${filename}`);
            }
            if (!closure.has(`@contentful/${entry.name}`))
              throw new Error(`Unexpected SDK: ${filename}`);
          }
          await inspect(filename);
        }
      }
    }
    await inspect(modules);
    for (const name of closure) {
      const filename = path.join(modules, name, 'package.json');
      if ((await lstat(path.dirname(filename))).isSymbolicLink())
        throw new Error(`Linked SDK: ${name}`);
      const installed = JSON.parse(await readFile(filename, 'utf8'));
      const source = manifests.get(name)!.manifest;
      if (installed.version !== source.version) throw new Error(`SDK version mismatch: ${name}`);
    }
    // Compare every installed SDK archive member before compiler transformations.
    for (const archive of archives) {
      const extracted = await mkdtemp(path.join(temporary, 'archive-'));
      run('tar', ['-xzf', archive, '-C', extracted]);
      const archivedRoot = path.join(extracted, 'package');
      const manifest: Manifest = JSON.parse(
        await readFile(path.join(archivedRoot, 'package.json'), 'utf8')
      );
      async function compare(directory: string): Promise<void> {
        for (const entry of await readdir(directory, { withFileTypes: true })) {
          const filename = path.join(directory, entry.name);
          if (entry.isDirectory()) await compare(filename);
          else {
            const installed = path.join(
              modules,
              manifest.name,
              path.relative(archivedRoot, filename)
            );
            if (!(await readFile(filename)).equals(await readFile(installed)))
              throw new Error(`Archive mismatch: ${installed}`);
          }
        }
      }
      await compare(archivedRoot);
    }
    const localRequire = createRequire(path.join(temporary, 'package.json'));
    const ts = localRequire('typescript') as typeof import('typescript');
    const compiler = localRequire('svelte/compiler') as typeof import('svelte/compiler');
    report(`Svelte ${compiler.VERSION}; TypeScript ${ts.version}; Kit absent`);
    const forbidden =
      /^(?:@sveltejs\/kit(?:\/|$)|\$app(?:\/|$)|\$env(?:\/|$)|@contentful\/experiences-(?:node|react|nextjs)(?:\/|$)|react(?:-dom)?(?:\/|$))/;
    function imports(filename: string, text: string) {
      const source = ts.createSourceFile(filename, text, ts.ScriptTarget.Latest, true);
      const values: string[] = [];
      function visit(node: import('typescript').Node) {
        if (
          (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
          node.moduleSpecifier &&
          ts.isStringLiteral(node.moduleSpecifier)
        )
          values.push(node.moduleSpecifier.text);
        if (
          ts.isImportTypeNode(node) &&
          ts.isLiteralTypeNode(node.argument) &&
          ts.isStringLiteral(node.argument.literal)
        )
          values.push(node.argument.literal.text);
        if (
          ts.isCallExpression(node) &&
          node.expression.kind === ts.SyntaxKind.ImportKeyword &&
          node.arguments[0] &&
          ts.isStringLiteral(node.arguments[0])
        )
          values.push(node.arguments[0].text);
        ts.forEachChild(node, visit);
      }
      visit(source);
      for (const value of values)
        if (forbidden.test(value))
          throw new Error(`Forbidden portable import ${value} in ${filename}`);
      return values;
    }
    const sdkRoot = path.join(modules, '@contentful/experiences-svelte');
    const seen = new Set<string>();
    async function inspectRuntime(filename: string): Promise<void> {
      if (seen.has(filename)) return;
      seen.add(filename);
      let text = await readFile(filename, 'utf8');
      // Consume actual packed Svelte sources using the selected consumer compiler.
      if (filename.endsWith('.svelte')) {
        text = compiler.compile(text, { filename, generate: 'server' }).js.code;
      } else if (filename.endsWith('.svelte.js')) {
        text = compiler.compileModule(text, { filename, generate: 'server' }).js.code;
      }
      for (const specifier of imports(filename, text)) {
        let resolved: string | undefined;
        if (specifier.startsWith('.')) resolved = path.resolve(path.dirname(filename), specifier);
        else if (specifier.startsWith(sdkPrefix)) {
          // Resolve ESM export conditions rather than accidentally auditing the CJS sibling.
          const parts = specifier.split('/');
          const name = parts.slice(0, 2).join('/');
          const manifest = JSON.parse(
            await readFile(path.join(modules, name, 'package.json'), 'utf8')
          );
          let entry = manifest.exports[parts.length === 2 ? '.' : `./${parts.slice(2).join('/')}`];
          while (typeof entry !== 'string') entry = entry.import ?? entry.default ?? entry.svelte;
          resolved = path.resolve(modules, name, entry);
        }
        if (resolved) await inspectRuntime(resolved);
      }
    }
    // Resolve declarations from the exact installed archives with no skipLibCheck.
    await writeFile(
      path.join(temporary, 'probe.ts'),
      `import type { ComponentProps } from 'svelte';\nimport { createExperiences, getExperiences, getExperiencesState, getExperiencesActions, ServerExperienceRenderer, resolveExperience, type Config } from '@contentful/experiences-svelte';\nconst config: Config = { components: {} };\nconst binding = createExperiences({ config });\ntype RootProps = ComponentProps<typeof binding.ExperiencesRoot>;\nconst root: RootProps = { delivery: { accessToken: 'probe' }, spaceId: 'probe', environmentId: 'master' };\nvoid [root, binding, getExperiences, getExperiencesState, getExperiencesActions, ServerExperienceRenderer, resolveExperience];\n`
    );
    const program = ts.createProgram([path.join(temporary, 'probe.ts')], {
      strict: true,
      skipLibCheck: false,
      noEmit: true,
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      lib: ['lib.es2022.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'],
      types: ['node'],
      typeRoots: [path.join(modules, '@types')],
    });
    const diagnostics = ts.getPreEmitDiagnostics(program);
    if (diagnostics.length)
      throw new Error(
        ts.formatDiagnosticsWithColorAndContext(diagnostics, {
          getCanonicalFileName: (name) => name,
          getCurrentDirectory: () => temporary,
          getNewLine: () => '\n',
        })
      );
    for (const source of program.getSourceFiles()) {
      if (!source.fileName.startsWith(`${temporary}/`))
        throw new Error(`Declaration escaped isolation: ${source.fileName}`);
    }
    const declarations = program
      .getSourceFiles()
      .filter((file) => file.fileName.includes('/@contentful/experiences-'));
    for (const source of declarations) imports(source.fileName, source.text);
    await inspectRuntime(path.join(sdkRoot, 'dist/index.js'));
    // Compile packed sources in memory, leaving installed archive bytes unchanged.
    await writeFile(
      path.join(temporary, 'svelte-loader.mjs'),
      `import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { compile, compileModule } from 'svelte/compiler';
export async function load(url, context, next) {
  if (url.endsWith('.svelte') || url.endsWith('.svelte.js')) {
    const source = await readFile(new URL(url), 'utf8');
    const options = { filename: fileURLToPath(url), generate: 'server' };
    return { format: 'module', source: (url.endsWith('.svelte') ? compile(source, options) : compileModule(source, options)).js.code, shortCircuit: true };
  }
  return next(url, context);
}
`
    );
    await writeFile(
      path.join(temporary, 'SuppliedRoot.svelte'),
      `<script>
import { createExperiences } from '@contentful/experiences-svelte';
const binding = createExperiences({ config: { components: {} } });
const plan = { nodes: [], metadata: {}, debug: false };
function unexpectedActivation() { throw new Error('SSR unexpectedly activated Web'); }
</script>
<binding.ExperiencesRoot spaceId="probe" environmentId="master" delivery={{ accessToken: 'probe' }} snapshot={{ locale: 'fr-FR' }} onStatesReady={unexpectedActivation}>
  <p>Supplied SSR baseline</p>
  <binding.ExperienceRenderer experience={plan} />
</binding.ExperiencesRoot>
`
    );
    await writeFile(
      path.join(temporary, 'probe.mjs'),
      `import { render } from 'svelte/server';\nimport SuppliedRoot from './SuppliedRoot.svelte';\nimport { createExperiences, getExperiences, getExperiencesState, getExperiencesActions, ServerExperienceRenderer, resolveExperience } from '@contentful/experiences-svelte';\nconst binding = createExperiences({ config: { components: {} } });\nif (!binding || typeof getExperiences !== 'function' || typeof getExperiencesState !== 'function' || typeof getExperiencesActions !== 'function' || typeof ServerExperienceRenderer !== 'function' || typeof resolveExperience !== 'function') throw new Error('Portable exports missing');\nconst first = render(SuppliedRoot).body;\nconst second = render(SuppliedRoot).body;\nif (!first.includes('Supplied SSR baseline') || !second.includes('Supplied SSR baseline')) throw new Error('Supplied SSR content missing');\nprocess.stdout.write('Kit-free Node ESM import, portable registry construction and repeated supplied-root SSR passed\\n');\n`
    );
    report(
      run(process.execPath, [
        '--loader',
        path.join(temporary, 'svelte-loader.mjs'),
        path.join(temporary, 'probe.mjs'),
      ])
    );
    report(
      `Strict declaration check passed (${declarations.length} SDK declaration files); portable runtime graph passed (${seen.size} files).`
    );
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

verifySveltePortability().catch((error: unknown) => {
  process.stderr.write(`${String(error)}\n`);
  process.exitCode = 1;
});
