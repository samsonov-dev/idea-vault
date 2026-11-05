import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 2,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'output/playwright/report' }]],
  outputDir: 'output/playwright/results',
  use: {
    ...devices['Desktop Chrome'],
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium-production', use: { baseURL: 'http://127.0.0.1:4173' } },
    {
      name: 'chromium-development',
      testMatch: 'typing.spec.ts',
      use: { baseURL: 'http://127.0.0.1:5174' },
    },
  ],
  webServer: [
    {
      command: 'pnpm exec vite preview --host 127.0.0.1 --port 4173 --strictPort',
      url: 'http://127.0.0.1:4173',
      reuseExistingServer: false,
    },
    {
      command: 'pnpm exec vite --host 127.0.0.1 --port 5174 --strictPort',
      url: 'http://127.0.0.1:5174',
      reuseExistingServer: false,
    },
  ],
});
