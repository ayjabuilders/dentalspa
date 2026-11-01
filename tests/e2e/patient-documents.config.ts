import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.', testMatch: 'patient-documents-local.spec.ts', workers: 1,
  timeout: 120000, expect: { timeout: 20000 },
  outputDir: '../../.local/qa/patient-documents-native/results',
  use: { browserName: 'chromium', trace: 'off', video: 'off', screenshot: 'only-on-failure', reducedMotion: 'reduce' },
});
