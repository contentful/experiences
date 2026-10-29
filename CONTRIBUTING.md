# Contributing to the Contentful Experiences SDK

Thank you for your interest in contributing! This SDK renders Contentful Experience Orchestration (ExO) payloads against your own design-system components. Contributions from the community are welcome and appreciated.

> ⚠️ This project is **alpha** and actively published to npm. Public APIs are unstable and will change. If you're building something on top of the SDK, expect breaking changes between commits.

## 🤝 How to contribute

There are several ways to help:

- **Report bugs** — Open a [bug report](https://github.com/contentful/experiences/issues/new?template=bug_report.md). Please only file bugs that affect other users of the project. For issues that might be specific to your setup or contain sensitive information, [visit our support center](https://support.contentful.com/hc/en-us) first.
- **Suggest features** — Share ideas by opening a [feature request](https://github.com/contentful/experiences/issues/new?template=feature_request.md).
- **Submit a pull request** — For docs and small fixes, open a PR directly. For larger changes, please open a feature request first so we can discuss the approach before you invest time in it.

## 📋 Before you start

1. Read the [README](./README.md) and [`AGENTS.md`](./AGENTS.md) — the latter is the operating manual, covering architecture, package boundaries, and the design decisions behind them.
2. Browse existing [issues](https://github.com/contentful/experiences/issues) and [pull requests](https://github.com/contentful/experiences/pulls) to avoid duplicating work.
3. Review our [Code of Conduct](https://github.com/contentful/.github/blob/master/CODE_OF_CONDUCT.md).

## 🛠️ Development setup

### Prerequisites

- Node.js >= 22.12
- npm (the repo uses npm workspaces — don't substitute another package manager)

### About Nx

This is an [Nx](https://nx.dev/) monorepo. Nx gives you caching and task orchestration across packages, so `npm run build`, `npm test`, etc. only re-run work that actually changed. A few helpful commands:

```sh
npx nx graph                          # visualize package dependencies
npx nx run-many -t test --projects=adapter-react   # run one package's tests
npx nx show project adapter-react     # see a project's available targets
```

### Setup steps

1. **Fork and clone**

   ```sh
   git clone https://github.com/<your-username>/experiences.git
   cd experiences
   ```

2. **Install dependencies** (installs the whole workspace)

   ```sh
   npm install
   ```

3. **Build all packages**

   ```sh
   npm run build
   ```

4. **Run the tests**

   ```sh
   npm test
   ```

### Running an example app

The `examples/` directory has a Next.js, a SvelteKit, and an Angular app that render live XDA payloads — the fastest way to see a change end to end.

```sh
cd examples/nextjs
cp .env.example .env.local   # fill in SPACE_ID + CDA_TOKEN
npm run dev                  # http://localhost:3000/<experience-id>
```

`examples/sveltekit` and `examples/angular` mirror it, registering the same components against the same payload. Each has its own README for the framework-specific setup.

## 🏗️ Repository layout

```
packages/
├── core/            # @contentful/experiences-sdk-core   — runtime-neutral types + resolveExperience
├── design/          # @contentful/experiences-design — CSS-property helpers for adapter `toCss` utilities
├── client/          # @contentful/experiences-client — shared runtime + delivery integration
├── node/            # @contentful/experiences-node — request-scoped Node runtime
├── web/             # @contentful/experiences-web — stateful browser runtime
├── live-preview/    # @contentful/experiences-live-preview (optional customer-facing Preview Session source for any framework)
├── adapter-react/   # @contentful/experiences-react  — React renderer (customer-facing)
├── adapter-svelte/  # @contentful/experiences-svelte — Svelte renderer (customer-facing)
└── adapter-angular/ # @contentful/experiences-angular — Angular renderer (customer-facing)
examples/
├── nextjs/          # Next.js 15 example app
├── sveltekit/       # SvelteKit 2 example app
└── angular/         # Angular 20 + @angular/ssr example app
```

Package boundaries matter — see the "Conventions" section of [`AGENTS.md`](./AGENTS.md) before moving code between packages. In short: `core` stays free of framework and delivery-client dependencies, and only `client` may import `@contentful/experience-delivery`.

## ✅ Submitting changes

1. **Create a branch**

   ```sh
   git checkout -b feat/your-feature
   # or
   git checkout -b fix/issue-description
   ```

2. **Make your changes**, adding or updating tests alongside the source (`src/*.test.ts` next to the code).

3. **Run the checks locally** — the same ones CI runs:

   ```sh
   npm run lint
   npm run typecheck
   npm test
   npm run format:check
   ```

4. **Commit** using [Conventional Commits](https://www.conventionalcommits.org/) (enforced by commitlint):

   ```sh
   git commit -m "feat: add design-token resolver hook"
   ```

   > `feat:` and `fix:` trigger a version bump on release; `chore:` does not. Allowed types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`, `build`, `ci`, `revert`.

5. **Push and open a pull request** against `main`, filling out the PR template.

## Code style

- **Formatting** — Prettier, enforced by a pre-commit hook.
- **Linting** — ESLint flat config (`eslint.config.mjs`).
- **Tests** — Vitest, living next to the source they cover.

## Pre-commit hooks

[Husky](https://typicode.github.io/husky/) runs on every commit:

- **`pre-commit`** — `lint-staged` formats and lints staged `.ts`/`.tsx` files (Prettier + ESLint `--fix`).
- **`commit-msg`** — commitlint validates the message against the Conventional Commits spec.

## CI/CD

CI runs on every push and PR via `.github/workflows/main.yaml`, which orchestrates:

| Job         | When                                 | What it does                                                                              |
| ----------- | ------------------------------------ | ----------------------------------------------------------------------------------------- |
| **Build**   | All pushes and PRs                   | `npm ci` → `npm run build`, caches `packages/*/dist`                                      |
| **Check**   | After Build                          | lint → typecheck → format check → tests                                                   |
| **Release** | Push to `main` (after Build + Check) | `scripts/release.ts`: version → rebuild → verify → changelog/tag/GitHub release → publish |

## Releases

Releases are automated with [Nx Release](https://nx.dev/features/manage-releases) driven by conventional-commit history. Maintainers don't cut releases by hand — merging a `feat:`/`fix:` commit to `main` is what drives the version bump, changelog, and publish.

`scripts/release.ts` runs the steps in this order:

1. `releaseVersion` writes new versions to disk. Nothing is committed or tagged yet.
2. Every package is rebuilt without the Nx cache. Built packages embed their own version (event `context.library`, `X-Contentful-User-Agent`), and the cached build-job output still carries the previous one.
3. `verify-release-artifact` checks each built version against `package.json`.
4. `releaseChangelog` writes changelogs, commits, tags, pushes, and creates the GitHub Releases.
5. `releasePublish` publishes to GitHub Packages.

The prerelease workflow runs the same script with `--specifier prerelease --preid dev --tag dev`. `npx tsx scripts/release.ts --dry-run` previews a release locally without writing anything.

### Recovering a failed release

- **Failed in steps 1–3** (versioning, rebuild, verification): nothing was committed, tagged, pushed, or published. Fix the cause on `main` and the next push releases normally.
- **Failed in step 4** (changelog, tag, or push): check whether the `chore(release): publish` commit and `<project>@<version>` tags reached `origin`. If they did not, nothing is published and the next push retries. If they did, continue as for step 5.
- **Failed in step 5** (publish): the release commit, tags, and GitHub Releases exist, but some packages are missing from the registry. **Do not re-run the release job.** It checks out the commit before the release commit and would version again. Instead, check out the release commit (`git checkout <project>@<version>`), then run `npm ci`, `npm run build`, `npx nx run-many -t verify-release-artifact`, and `npx nx release publish` with a package-write token in `~/.npmrc` (see the `Setup npmrc file` step in `release.yaml`). `nx release publish` skips versions that already exist in the registry, so it is safe to repeat.

## Support & questions

For usage questions and support, [visit the Contentful support center](https://support.contentful.com/hc/en-us). Use GitHub issues for bugs and feature requests specific to this SDK.

## License

By contributing, you agree that your contributions are licensed under the MIT License. See [`LICENSE`](./LICENSE) and [`NOTICE`](./NOTICE).
