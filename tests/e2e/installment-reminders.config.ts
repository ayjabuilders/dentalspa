import { defineConfig } from '@playwright/test';

// The coordinator owns the running clinic build. Never start or replace a server here.
export default defineConfig({
  testDir: '.', testMatch: 'installment-reminders-local.spec.ts', workers: 1, fullyParallel: false,
  timeout: 90000, expect: { timeout: 15000 },
  outputDir: '../../.local/qa/installment-reminders-native/results',
  reporter: [['list']],
  use: { browserName: 'chromium', headless: true, reducedMotion: 'reduce', trace: 'off', video: 'off', screenshot: 'only-on-failure' },
});
