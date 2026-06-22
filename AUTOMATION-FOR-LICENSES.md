# License Automation

This document describes how to maintain the [NOTICE](NOTICE) file with up-to-date license information for all dependencies.

## Automated License Tracking

We use automated tools to track and document all third-party licenses used in this project.

### Prerequisites

```bash
npm install -g license-checker
```

### Generate License Report

To generate a complete license report:

```bash
npx license-checker --summary
```

To generate detailed license information:

```bash
npx license-checker --production --json > licenses/licenses.json
```

### Update NOTICE File

1. Run the license checker to get current dependencies:

   ```bash
   npx license-checker --production
   ```

2. Review the output for any new dependencies or license changes

3. Update the [NOTICE](NOTICE) file with any new third-party components

4. Ensure all licenses are compatible with the project's MIT license

### Acceptable Licenses

The following licenses are generally acceptable for use in this project:

- MIT
- Apache-2.0
- BSD-2-Clause
- BSD-3-Clause
- ISC

### License Compatibility

Before adding a new dependency, verify its license is compatible with this project's MIT license.

If you encounter a dependency with a different license type, please consult with the maintainers before proceeding.

### CI Integration

License checking can be integrated into CI/CD pipelines to automatically verify license compliance:

```yaml
- name: Check licenses
  run: npx license-checker --failOn "GPL;AGPL;LGPL"
```

## Resources

- [Choose a License](https://choosealicense.com/)
- [SPDX License List](https://spdx.org/licenses/)
- [npm license-checker](https://www.npmjs.com/package/license-checker)
