# Contributing to the Contentful Experiences SDK

Thank you for your interest in contributing! This SDK renders Contentful Experience Orchestration (ExO) payloads against your own design-system components. Contributions from the community are welcome and appreciated.

> ⚠️ This project is **pre-alpha** and not yet published to npm. Public APIs are unstable and will change. If you're building something on top of the SDK, expect breaking changes between commits.

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

- Node.js >= 18
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

The `examples/` directory has a Next.js and a SvelteKit app that render live XDA payloads — the fastest way to see a change end to end.

```sh
cd examples/nextjs
cp .env.example .env.local   # fill in SPACE_ID + CDA_TOKEN
npm run dev                  # http://localhost:3000/<experience-id>
```

The SvelteKit example under `examples/sveltekit` mirrors it 1:1.

## 🏗️ Repository layout

```
packages/
├── core/            # @contentful/experiences-sdk-core   — runtime-neutral types + resolveExperience
├── design/          # @contentful/experiences-design — pure viewport + design-value math
├── client/          # @contentful/experiences-client — delivery client + fetchExperience
├── adapter-react/   # @contentful/experiences-react  — React renderer (customer-facing)
└── adapter-svelte/  # @contentful/experiences-svelte — Svelte renderer (customer-facing)
examples/
├── nextjs/          # Next.js 15 example app
└── sveltekit/       # SvelteKit 2 example app
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

| Job         | When                                 | What it does                                         |
| ----------- | ------------------------------------ | ---------------------------------------------------- |
| **Build**   | All pushes and PRs                   | `npm ci` → `npm run build`, caches `packages/*/dist` |
| **Check**   | After Build                          | lint → format check → tests                          |
| **Release** | Push to `main` (after Build + Check) | Nx Release → publish → GitHub release                |

## Releases

Releases are automated with [Nx Release](https://nx.dev/features/manage-releases) driven by conventional-commit history. Maintainers don't cut releases by hand — merging a `feat:`/`fix:` commit to `main` is what drives the version bump, changelog, and publish.

## Support & questions

For usage questions and support, [visit the Contentful support center](https://support.contentful.com/hc/en-us). Use GitHub issues for bugs and feature requests specific to this SDK.

## License

By contributing, you agree that your contributions are licensed under the MIT License. See [`LICENSE`](./LICENSE) and [`NOTICE`](./NOTICE).
