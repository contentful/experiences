## 🚨 TEMPLATE SETUP INSTRUCTIONS - DELETE THIS ENTIRE SECTION AFTER SETUP 🚨

> **⚠️ Important:** This section contains setup instructions for the template. Once you've completed all the steps below and customized your project, **delete everything from here down to the "---" separator** and keep only your actual project README content.

### ⚡ How to use this template

This is a TypeScript library template for creating open source npm packages, built using:

- npm for package management
- TypeScript for type safety and compilation
- Vitest for testing with coverage
- ESLint and Prettier for code quality
- Husky and lint-staged for pre-commit hooks
- GitHub Actions for CI/CD

### 🚀 Getting started with the template

1. **Create your new repo from this template**
   - Click on the green **Use this template** button (top left on this page)
   - Choose a repository name and create the repo
   - Clone your newly created repository and install dependencies:

   ```bash
   git clone https://github.com/contentful/your-new-repo-name.git
   cd your-new-repo-name
   npm install
   ```

2. **Update package.json**
   - `name`: Change `@contentful/your-package-name` to your actual package name
   - `description`: Add a meaningful description
   - `repository.url`: Update `repo-name` to your actual repo name
   - `bugs.url`: Update `repo-name` to your actual repo name
   - `homepage`: Update `repo-name` to your actual repo name
   - `keywords`: Update with relevant keywords

3. **Update catalog-info.yaml**
   - `metadata.name`: Change `your-package-name` to your package name
   - `metadata.description`: Add a meaningful description
   - `metadata.annotations.github.com/project-slug`: Update `repo-name` to your repo name
   - `metadata.tags`: Update with relevant tags for your project
   - `spec.owner`: Change `team-name` to your team name (e.g., `team-developer-experience`)
   - Update all URLs with your actual repo and package names

4. **Update CODEOWNERS** ⚠️
   - Open `.github/CODEOWNERS`
   - **Important:** Replace `@contentful/team-developer-experience` with your actual team name
   - This file determines who gets automatically requested for PR reviews
   - The file contains a TODO comment as a reminder to make this change

5. **Configure NX Release and GitHub Actions**
   - Review `nx.json` for release configuration
   - The template uses NX Release for automated versioning, changelog generation, and publishing
   - **Important:** The release job in `.github/workflows/main.yml` is commented out by default for template repos
   - Uncomment the `release` job section in `.github/workflows/main.yml` to enable automated releases on push to main
   - Configure the `VAULT_URL` secret in your repository settings before enabling the release workflow
   - Default configuration supports conventional commits and automated GitHub releases
   - [Learn more about NX Release in the official documentation](https://nx.dev/docs/guides/nx-release)

6. **Run tests to verify setup**

   ```bash
   npm test
   npm run build
   npm run lint
   ```

### 🔴🔴🔴 Set up permissions

1. Go to your new repo's **Settings** tab, then to **Collaborators and teams**
2. Add these permissions:
   - your-own-team — admin
   - Product Development team — write
   - Service Accounts team — write
   - team-security team — write

### 🛡️ Set branch protection

1. Go to **Settings > Branches** (left sidebar)
2. Click **Add classic branch protection rule** (not "Add branch ruleset"!)
3. Enable:
   - ✅ Require a pull request before merging
   - ✅ Require approvals
   - ✅ Require review from Code Owners
   - ✅ Require status checks to pass before merging
   - ✅ Require branches to be up to date before merging
     - ➡️ Add `main` into the branches textbox
   - ✅ Do not allow bypassing the above settings

---

## 🚨 END OF TEMPLATE INSTRUCTIONS - DELETE EVERYTHING ABOVE THIS LINE 🚨

---

## 🔽 YOUR PROJECT README STARTS HERE 🔽

Replace the content below with your actual project information.

---

# Project Name

[![CI](https://github.com/contentful/repo-name/workflows/CI/badge.svg)](https://github.com/contentful/repo-name/actions)
[![npm version](https://img.shields.io/npm/v/@contentful/your-package-name.svg)](https://www.npmjs.com/package/@contentful/your-package-name)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

> A brief description of what your SDK/tool/library does and what problem it solves.

## Table of Contents

- [Use Cases](#use-cases)
- [Features](#features)
- [Getting Started](#getting-started)
- [Configuration](#configuration)
- [Documentation](#documentation)
- [Examples](#examples)
- [Contributing](#contributing)
- [Support](#support)
- [License](#license)

## Use Cases

This SDK/tool/library can help you:

- **Use Case 1**: Description of the first major use case
- **Use Case 2**: Description of the second major use case
- **Use Case 3**: Description of the third major use case
- **Use Case 4**: Description of the fourth major use case

## Features

- Feature 1: Brief description
- Feature 2: Brief description
- Feature 3: Brief description
- Feature 4: Brief description

## Getting Started

### Prerequisites

- Node.js 18 or higher
- npm or yarn package manager
- [Any other prerequisites specific to your project]

### Installation

#### Using npm

```bash
npm install @contentful/your-package-name
```

#### Using yarn

```bash
yarn add @contentful/your-package-name
```

#### From Source

```bash
git clone https://github.com/contentful/repo-name.git
cd repo-name
npm install
npm run build
```

### Quick Start

```javascript
// Example usage code
import { YourLibrary } from 'your-package-name';

const client = new YourLibrary({
  apiKey: 'your-api-key',
});

// Basic usage example
const result = await client.doSomething();
console.log(result);
```

## Documentation

For full documentation, visit [docs.yourproject.com](https://docs.yourproject.com) or check out our [API Reference](docs/API.md).

### Basic Usage

Detailed examples and common use cases:

```javascript
// Example 1: Common use case
const example1 = await client.method1();

// Example 2: Advanced usage
const example2 = await client.method2({
  option1: 'value1',
  option2: 'value2',
});
```

## Configuration

Configuration options and environment variables:

| Option    | Type   | Default  | Description              |
| --------- | ------ | -------- | ------------------------ |
| `apiKey`  | string | required | Your API key             |
| `timeout` | number | 5000     | Request timeout in ms    |
| `retries` | number | 3        | Number of retry attempts |

## Examples

Check out the [examples](examples/) directory for more comprehensive examples:

- [Basic Example](examples/basic.js)
- [Advanced Example](examples/advanced.js)
- [Integration Example](examples/integration.js)

## Releasing

This project uses [NX Release](https://nx.dev/features/manage-releases) for automated version management, changelog generation, and publishing.

### Prerequisites

- Ensure you have commit rights to the repository
- Make sure `NPM_TOKEN` secret is configured in GitHub repository settings
- All commits should follow [Conventional Commits](https://www.conventionalcommits.org/) format

### How to Release

All releases are handled through GitHub Actions to ensure consistency and proper permissions.

#### Automated Release via GitHub Actions

1. Go to **Actions** tab in GitHub
2. Select **NX Release** workflow
3. Click **Run workflow**
4. Choose options:
   - Leave version empty for auto-detection from commits
   - Or specify a version (e.g., `1.2.3`, `major`, `minor`, `patch`)
   - Check "dry-run" to test without publishing

This will:

- Analyze commits since last release
- Bump version based on conventional commits
- Update CHANGELOG.md
- Create git tag and commit
- Publish to npm
- Create GitHub release

#### Testing Releases

To test what a release would do without actually publishing:

1. Go to **Actions** tab → **NX Release** workflow
2. Click **Run workflow**
3. Check the **dry-run** option
4. Review the workflow output to see what changes would be made

### Version Bump Rules

NX Release automatically determines version bumps from conventional commits:

- `feat:` commits → **minor** version bump (0.1.0 → 0.2.0)
- `fix:` commits → **patch** version bump (0.1.0 → 0.1.1)
- `feat!:` or `BREAKING CHANGE:` → **major** version bump (0.1.0 → 1.0.0)

### Changelog Generation

The changelog is automatically generated from commit messages:

- Groups commits by type (Features, Bug Fixes, Breaking Changes)
- Includes commit references and author information
- Updates `CHANGELOG.md` with each release

### Troubleshooting

**No version bump detected:**

- Ensure commits follow conventional commit format
- Check that there are unreleased commits since the last tag

**Publishing fails:**

- Verify `NPM_TOKEN` secret is set correctly
- Ensure package name is unique on npm
- Check that tests and build pass

**GitHub release fails:**

- Verify GitHub Actions has write permissions
- Check that `GITHUB_TOKEN` has proper scopes

## Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Development Setup

```bash
# Clone the repository
git clone https://github.com/username/repo-name.git

# Install dependencies
npm install

# Run tests
npm test

# Build the project
npm run build
```

## Support

### Get Help

- [Contentful support resources](https://www.contentful.com/help/getting-started/how-to-get-help/)
- [Report bugs or request features](https://github.com/contentful/contentful-mcp-server/issues)
- [Contentful Community Discord](https://www.contentful.com/discord/)

### Professional Support

If you're a Contentful customer, you can reach out to our [Support team](https://www.contentful.com/support/).

## License and Notices

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

Third-party licenses are documented in:

- [NOTICE](NOTICE) - List of third-party components
- [licenses/](licenses/) - Full license texts for dependencies

## Contributors

Thanks goes to these wonderful people ([emoji key](https://allcontributors.org/docs/en/emoji-key)):

<!-- ALL-CONTRIBUTORS-LIST:START - Do not remove or modify this section -->
<!-- prettier-ignore-start -->
<!-- markdownlint-disable -->
<!-- markdownlint-restore -->
<!-- prettier-ignore-end -->
<!-- ALL-CONTRIBUTORS-LIST:END -->

This project follows the [all-contributors](https://github.com/all-contributors/all-contributors) specification. Contributions of any kind welcome!

## Code of Conduct

We want to provide a safe, inclusive, welcoming, and harassment-free space and experience for all participants, regardless of gender identity and expression, sexual orientation, disability, physical appearance, socioeconomic status, body size, ethnicity, nationality, level of experience, age, religion (or lack thereof), or other identity markers.

Read our full [Code of Conduct](CODE_OF_CONDUCT.md).

## Security

Please see our [Security Policy](SECURITY.md) for reporting vulnerabilities.
