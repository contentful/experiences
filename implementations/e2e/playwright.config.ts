import { defineConfig } from '@playwright/test';
import { apps, appDirectory, baseUrl, missingLiveConfiguration, type AppName } from './live-config';

const names = Object.keys(apps) as AppName[];
// Only start references whose live configuration is present; the others skip in their specs.
const configured = names.filter((app) => missingLiveConfiguration(app) === undefined);

export default defineConfig({
  testDir: './tests',
  // Live services: serial per app keeps visitor identities and event counts unambiguous.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 20_000 },
  reporter: [['list']],
  use: { trace: 'retain-on-failure' },
  projects: names.map((app) => ({
    name: app,
    testMatch: `${app}.spec.ts`,
    use: { baseURL: baseUrl(app) },
  })),
  webServer: configured.map((app) => ({
    command: apps[app].command,
    cwd: appDirectory(app),
    url: baseUrl(app),
    // Reuse an app already started with its own dev/serve target.
    reuseExistingServer: true,
    timeout: 180_000,
    stdout: 'ignore',
    stderr: 'pipe',
  })),
});
