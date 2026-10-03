import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  workers: 1,
  timeout: 120000,
  expect: { timeout: 10000 },
  use: {
    baseURL: 'http://127.0.0.1:3100',
    browserName: 'chromium',
    channel: 'chrome',
    headless: true,
    trace: 'retain-on-failure',
  },
  webServer: process.env.E2E_EXTERNAL_SERVER
    ? undefined
    : [
        {
          command: 'node tests/local-supabase.mjs',
          url: 'http://127.0.0.1:54329/health',
          reuseExistingServer: false,
        },
        {
          command: 'node node_modules/next/dist/bin/next dev --port 3100',
          url: 'http://127.0.0.1:3100',
          reuseExistingServer: false,
          env: {
            NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54329',
            NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'local-test-key',
            NEXT_TELEMETRY_DISABLED: '1',
          },
        },
      ],
  reporter: [['list'], ['html', { open: 'never' }]],
});
