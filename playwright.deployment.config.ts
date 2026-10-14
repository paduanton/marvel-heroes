import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/deployment',
  outputDir: './test-results/deployment',
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: `http://127.0.0.1:${process.env.FULL_STACK_PORT ?? 4175}`,
    browserName: 'chromium',
    channel: process.env.PLAYWRIGHT_CHANNEL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 1000 } } },
    { name: 'mobile', use: { viewport: { width: 320, height: 844 }, isMobile: true, hasTouch: true } },
  ],
});
