import { defineConfig } from '@playwright/test';
import deployment from './playwright.deployment.config';

export default defineConfig(deployment, {
  testDir: './tests/upstream',
  outputDir: './test-results/upstream',
});
