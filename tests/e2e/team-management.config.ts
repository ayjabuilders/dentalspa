import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir: '.', testMatch: 'team-management-local.spec.ts', workers: 1, timeout: 90000, expect: { timeout: 15000 }, outputDir: '../../.local/qa/team-management-browser', use: { viewport: { width: 1440, height: 1000 }, trace: 'off', video: 'off', screenshot: 'only-on-failure', reducedMotion: 'reduce' } });
